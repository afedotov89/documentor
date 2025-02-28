const fs = require('fs');
const pathModule = require('path');
const { indexManager } = require('./indexManager.cjs');
const { isPathIgnored } = require('../config/ignorePatterns.cjs');
const { lockManager } = require('../utils/lockManager');
const path = require('path');
const os = require('os');

// Cleanup of stale locks when loading the module
(async function() {
  try {
    await lockManager.cleanupStaleLocks();
  } catch (error) {
    console.error('Error cleaning up stale locks:', error);
  }
})();

// Wrap the vscode module require to support test environment
let _vscode = null;
function getVscode() {
  if (!_vscode) {
    try {
      _vscode = require('vscode');
    } catch (error) {
      // Stub for vscode when module is not installed (for example, in tests)
      _vscode = {
        workspace: {
          getConfiguration: () => ({
            get: (key) => {
              if (key === 'OpenAI API Key') return process.env.OPENAI_API_KEY || 'dummy-api-key';
              if (key === 'model') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
              return undefined;
            }
          })
        },
        window: {
          createOutputChannel: (name) => ({
            show: (preserveFocus) => console.log(`[OutputChannel ${name}]: show (preserveFocus: ${preserveFocus})`),
            appendLine: (message) => console.log(`[OutputChannel ${name}]: ${message}`)
          }),
          showErrorMessage: (msg) => console.error('vscode.showErrorMessage:', msg),
          showInformationMessage: (msg) => console.log('vscode.showInformationMessage:', msg)
        }
      };
    }
  }
  return _vscode;
}

async function indexDirectory(currentPath, outputChannel, customIgnorePatterns = []) {
  // First process all subdirectories and files to gather information
  const fsPromises = fs.promises;
  const entries = await fsPromises.readdir(currentPath);
  const members = [];
  // Import indexPath inside the function to avoid circular dependencies
  const { indexPath } = require('./pathIndexer.cjs');
  
  let maxUpdateTime = 0; // Variable to track the maximum update time

  for (const entry of entries) {
    const fullPath = pathModule.join(currentPath, entry);
    
    // Skip ignored paths
    if (isPathIgnored(fullPath, customIgnorePatterns)) {
      console.log(`Skipping ignored path: ${fullPath}`);
      continue;
    }
    
    try {
      const pathInfo = await indexPath(fullPath, outputChannel, customIgnorePatterns);
      if (pathInfo) { // Only add if not ignored
        let member = {
          'type': pathInfo.type,
          'name': pathModule.basename(pathInfo.filePath),
          'description': pathInfo.docstring,
        }
        member.type = pathInfo.isDirectory ? 'directory' : 'file';
        members.push(member);

        // Update the maximum update time if the current pathInfo has a greater time
        if (pathInfo.updateTime > maxUpdateTime) {
          maxUpdateTime = pathInfo.updateTime;
        }
      }
    } catch (e) {
      outputChannel.appendLine(`Failed to process ${fullPath}: ${e}`);
    }
  }
  
  // Create a unique lock file path for the directory
  const normalizedPath = currentPath.replace(/[\/\\:]/g, '_');
  // Add a hash of the absolute path for uniqueness
  const hashPath = require('crypto').createHash('md5').update(currentPath).digest('hex').substring(0, 8);
  const lockFilePath = path.join(os.tmpdir(), `documentor_index_dir_${hashPath}_${normalizedPath}.lock`);
  
  let release;
  try {
    // Get a lock through the new module
    release = await lockManager.acquireLock(currentPath, 'documentor_index_dir', {
      retries: 5,
      stale: 600000 // 10 minutes for directories
    });
    
    outputChannel.appendLine(`Acquired directory lock for indexing: ${currentPath}`);

    // Check if current information exists in the index
    if (indexManager.isFileInfoValid(currentPath) && 
        indexManager.getFileInfo(currentPath) && 
        indexManager.getFileInfo(currentPath).timestamp >= maxUpdateTime) {
      const fileInfo = indexManager.getFileInfo(currentPath);
      console.log(`Using cached description for directory ${currentPath}`);
      return fileInfo;
    }  
    outputChannel.appendLine(`Indexing directory: ${currentPath}`);

    const contentDescription = `A project's subdirectory along the path \`${currentPath}\` 
   that contains the following members:\n${members.map(member => `- ${member.type}: ${member.name} - ${member.description}`).join('\n')}`;

    const configSettings = getVscode().workspace.getConfiguration();
    const apiKey = configSettings.get('OpenAI API Key');
    const model = configSettings.get('model');
    if (!apiKey) {
      outputChannel.appendLine("Error: API key is missing in the settings.");
      getVscode().window.showErrorMessage("Error: API key is missing in the settings.");
      throw new Error("API key is missing in the settings.");
    }
    
    // Change import using require instead of import
    const ChatGPTClient = require('../../openaiClient.cjs');
    const client = new ChatGPTClient(apiKey, model);

    const { answerDocstring, generateDirectoryDescription } = require('../utils');
    const response = await answerDocstring(client, contentDescription);
    const description = await generateDirectoryDescription(client, currentPath, members);

    // Save to index
    const info = indexManager.updateFileInfo(currentPath, response, description, members); 
    
    return info;
  } catch (error) {
    if (error.code === 'ELOCKED') {
      console.log(`Directory ${currentPath} is currently being indexed by another process`);
      return null;
    }
    throw error;
  } finally {
    if (release) {
      // Release the lock when done
      try {
        await release();
        console.log(`Released directory lock for indexing: ${currentPath}`);
      } catch (error) {
        console.error(`Failed to release directory lock for ${currentPath}:`, error);
      }
    }
  }
}

module.exports = { indexDirectory }; 