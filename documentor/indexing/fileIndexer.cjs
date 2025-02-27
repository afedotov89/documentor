const fs = require('fs');
const pathModule = require('path');
const { indexManager } = require('./indexManager.cjs');

// Initialize vscode with mock implementation for non-VS Code environments
let vscode;
try {
  vscode = require('vscode');
} catch (error) {
  vscode = {
    workspace: {
      getConfiguration: () => ({
        get: (key) => {
          switch (key) {
            case 'OpenAI API Key': return process.env.OPENAI_API_KEY;
            case 'model': return process.env.OPENAI_MODEL || 'gpt-4o-mini';
            default: return undefined;
          }
        }
      })
    },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
      }),
      showErrorMessage: (msg) => console.error(msg)
    }
  };
}

const { answerDocstring, generateDetailedDescription, getMembers } = require('../utils');

/**
 * Checks if file information is already cached and valid
 * @param {string} currentPath - Path to the file
 * @param {string} content - File content
 * @param {Object} outputChannel - VS Code output channel
 * @returns {Object|null} Cached file information or null
 */
async function processFileCache(currentPath, content, outputChannel) {
  if (indexManager.isFileInfoValid(currentPath)) {
    const fileInfo = indexManager.getFileInfo(currentPath);
    outputChannel.appendLine(`Using cached information for ${currentPath}`);
    return fileInfo;
  }
  return null;
}

/**
 * Gets OpenAI configuration from VS Code settings
 * @param {Object} outputChannel - VS Code output channel
 * @returns {Object} Configuration object containing API key and model
 * @throws {Error} If API key is missing
 */
function getOpenAIConfig(outputChannel) {
  const configSettings = vscode.workspace.getConfiguration();
  const apiKey = configSettings.get('OpenAI API Key');
  const model = configSettings.get('model');

  if (!apiKey) {
    const error = new Error('API key is missing from the configuration.');
    outputChannel.appendLine('Error: API key is missing from the configuration.');
    vscode.window.showErrorMessage(error.message);
    throw error;
  }

  return { apiKey, model };
}

/**
 * Checks if a file is likely to be binary by reading its first few bytes
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - True if file is likely binary
 */
async function isBinaryFile(filePath) {
  try {
    // Read first 512 bytes of the file
    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await fd.read(buffer, 0, 512, 0);
    await fd.close();

    if (bytesRead === 0) return false;

    // Check for null bytes and high percentage of non-printable characters
    let nullCount = 0;
    let nonPrintableCount = 0;

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) nullCount++;
      if (buffer[i] < 32 && ![9, 10, 13].includes(buffer[i])) nonPrintableCount++;
    }

    // If more than 10% is null bytes or 30% is non-printable, consider it binary
    return (nullCount / bytesRead > 0.1) || (nonPrintableCount / bytesRead > 0.3);
  } catch (error) {
    console.error(`Error checking if file is binary: ${error.message}`);
    return false;
  }
}

/**
 * Main function to index a file by processing its content and generating documentation
 * @param {string} currentPath - Path to the file to be indexed
 * @param {Object} outputChannel - VS Code output channel for logging
 * @returns {Promise<Object>} Indexed file information
 */
async function indexFile(currentPath, outputChannel) {
  try {
    // Check if file is binary
    if (await isBinaryFile(currentPath)) {
      console.log(`Skipping binary file: ${currentPath}`);
      return {
        filePath: currentPath,
        docstring: '',
        description: 'Binary file',
        members: [],
        timestamp: Date.now()
      };
    }

    // Read file content
    const content = await fs.promises.readFile(currentPath, 'utf8');

    // Check if file is too large (more than 10000 lines)
    const lineCount = content.split('\n').length;
    if (lineCount > 10000) {
      outputChannel.appendLine(`Warning: Skipping large file (${lineCount} lines): ${currentPath}`);
      return {
        filePath: currentPath,
        docstring: '',
        description: `Large file (${lineCount} lines)`,
        members: [],
        timestamp: Date.now()
      };
    }

    // Check cache first
    const cached = await processFileCache(currentPath, content, outputChannel);
    if (cached) {
      return cached;
    }

    // Log indexing start
    const ext = pathModule.extname(currentPath).toLowerCase();
    outputChannel.appendLine(`Indexing ${ext} file ${currentPath}`);

    // Initialize OpenAI client
    const ChatGPTClient = require('../../openaiClient.cjs');
    const { apiKey, model } = getOpenAIConfig(outputChannel);
    const client = new ChatGPTClient(apiKey, model);

    // Generate documentation
    const response = await answerDocstring(client);
    const description = await generateDetailedDescription(client, currentPath, content);
    const members = await getMembers(client, currentPath, content);

    // Update and return file information
    return indexManager.updateFileInfo(currentPath, response, description, members);

  } catch (error) {
    // Enhanced error handling
    if (outputChannel) {
      outputChannel.appendLine('Error during file indexing:');
      outputChannel.appendLine(`Message: ${error.message}`);
      outputChannel.appendLine(`Stack trace: ${error.stack}`);
    }
    vscode.window.showErrorMessage(`Failed to index file: ${error.message}`);
    throw error; // Re-throw to allow handling by caller
  }
}

module.exports = { indexFile };
