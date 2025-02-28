const fs = require('fs');
const pathModule = require('path');
const { addDocumentation } = require('../utils.js');
const { lockManager } = require('../utils/lockManager');
const { indexManager } = require('../indexing/indexManager.cjs');
const { indexPath } = require('../indexing/pathIndexer.cjs');
const path = require('path');
const os = require('os');

let vscode;
try {
  vscode = require('vscode');
} catch (error) {
  vscode = {
    workspace: {
      getConfiguration: () => ({
        get: (key) => {
          if (key === 'OpenAI API Key') return process.env.OPENAI_API_KEY;
          if (key === 'model') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
          return undefined;
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

// List of supported file extensions for documentation
const SUPPORTED_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  '.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs',
  // Python
  '.py', '.pyw',
  // Java
  '.java',
  // C/C++
  '.c', '.cpp', '.cc', '.h', '.hpp',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Go
  '.go',
  // Rust
  '.rs',
  // Swift
  '.swift',
  // Kotlin
  '.kt', '.kts',
  // C#
  '.cs'
]);

// Cleanup of stale locks when loading the module
(async function() {
  try {
    await lockManager.cleanupStaleLocks();
  } catch (error) {
    console.error('Error cleaning up stale locks:', error);
  }
})();

/**
 * Adds documentation to a file
 * @param {string} filePath - Path to the file
 * @param {object} outputChannel - VSCode output channel
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @returns {Promise<Object>} - File documentation result
 */
async function documentFile(filePath, outputChannel) {
  
  let release;
  try {
    // Get a lock through the new module
    release = await lockManager.acquireLock(filePath, 'documentor_doc_file', {
      retries: 5,
      stale: 600000 // 10 minutes for large files
    });
    
    console.log(`Acquired file lock for documenting: ${filePath}`);
  
    try {
      // First index the file to ensure we have up-to-date information
      const fileInfo = await indexPath(filePath, outputChannel);

      // Check file extension
      const ext = pathModule.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        console.log(`Skipping unsupported file type: ${filePath}`);
        return {
          success: false,
          path: filePath,
          type: 'file',
          message: 'Unsupported file type'
        };
      }
  
      // Read file content
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      
      // Check if file has been modified since last documentation
      const fileStats = await fs.promises.stat(filePath);
      const lastModifiedTime = parseInt(fileStats.mtimeMs, 10);
      const lastDocTime = fileInfo.lastDocumentedTime || 0;
      
      // If file hasn't changed since last documentation, skip
      if (lastDocTime && lastModifiedTime <= lastDocTime) {
        console.log(`File "${filePath}" has not changed since last documentation (${new Date(lastDocTime).toLocaleString()}). Skipping.`);
        return { 
          success: true, 
          path: filePath, 
          type: 'file', 
          message: 'Not modified since last documentation, skipped' 
        };
      }

      outputChannel.appendLine(`Documenting file: ${filePath}`);
      
      // Check if we have valid index info for this file
      const indexInfo = indexManager.getFileInfo(filePath);
      const indexValid = indexInfo && indexInfo.timestamp >= lastModifiedTime;
    
      const configSettings = vscode.workspace.getConfiguration();
      const apiKey = configSettings.get('OpenAI API Key');
      const model = configSettings.get('model');
      
      // Get documentation format settings
      const settings = {
        docFormats: {
          python: configSettings.get('documentor.docFormats.python'),
          javascript: configSettings.get('documentor.docFormats.javascript'),
          java: configSettings.get('documentor.docFormats.java'),
          cpp: configSettings.get('documentor.docFormats.cpp')
        }
      };
      
      if (!apiKey) {
        outputChannel.appendLine('Error: API key is missing from the configuration.');
        vscode.window.showErrorMessage('Error: API key is missing from the configuration.');
        throw new Error('API key is missing from the configuration.');
      }
      const ChatGPTClient = require('../../openaiClient.cjs');
      const client = new ChatGPTClient(apiKey, model);
  
  
      // Get the new content with added documentation, passing settings
      const docResult = await addDocumentation(client, filePath, content, settings, vscode, outputChannel);
      
      // Check if file was skipped due to syntax errors
      if (docResult.skipped) {
        outputChannel.appendLine(`Skipping documentation for file with syntax errors: ${filePath}`);
        vscode.window.showWarningMessage(`Skipped documentation for ${pathModule.basename(filePath)} - ${docResult.reason}`);
        return { 
          success: false, 
          path: filePath, 
          type: 'file', 
          message: docResult.reason || 'File has syntax errors', 
          syntaxErrors: docResult.validationResult?.errors || [],
          skipped: true
        };
      }
      
      // Write the updated content back to the file only if syntax is valid
      if (docResult.syntaxValid) {
        await fs.promises.writeFile(filePath, docResult.content.trim() + '\n', 'utf8');
        
        // Update the index timestamp and lastDocumentedTime if the index was valid before documentation
        if (indexInfo) {
          // Update lastDocumentedTime
          fileInfo.lastDocumentedTime = Date.now();
          indexManager.updateFileInfo(filePath, fileInfo);
          console.log(`Updated last documented time for "${filePath}"`);
        }
        
        if (docResult.attempts > 1) {
          outputChannel.appendLine(`Documentation added to file ${filePath} after ${docResult.attempts} attempts`);
        } else {
          outputChannel.appendLine(`Documentation added to file ${filePath}`);
        }
        return { 
          success: true, 
          path: filePath, 
          type: 'file', 
          message: `File successfully documented after ${docResult.attempts} attempt(s)` 
        };
      } else {
        outputChannel.appendLine(`Failed to document file ${filePath} without introducing syntax errors after ${docResult.attempts} attempts`);
        
        // Show specific errors if available
        if (docResult.validationResult && docResult.validationResult.errors.length > 0) {
          console.log('Syntax errors in generated documentation:');
          docResult.validationResult.errors.forEach(error => {
            console.log(`  - Line ${error.line}, Col ${error.column}: ${error.message}`);
          });
        }
        
        vscode.window.showErrorMessage(`Failed to document file ${filePath} without introducing syntax errors. Check output for details.`);
        
        return { 
          success: false, 
          path: filePath, 
          type: 'file', 
          message: 'Generated documentation would introduce syntax errors', 
          syntaxErrors: docResult.validationResult?.errors || []
        };
      }
    } catch (error) {
      outputChannel.appendLine(`Error documenting file ${filePath}: ${error.message}\n${error.stack}`);
      return { 
        success: false, 
        path: filePath, 
        type: 'file', 
        message: error.message, 
        error 
      };
    }
  } catch (error) {
    if (error.code === 'ELOCKED') {
      outputChannel.appendLine(`File ${filePath} is currently being documented by another process`);
      return { 
        success: false, 
        path: filePath, 
        type: 'file', 
        message: 'File is being documented by another process' 
      };
    }
    throw error;
  } finally {
    if (release) {
      // Release the lock when done
      try {
        await release();
        console.log(`Released file lock for documenting: ${filePath}`);
      } catch (error) {
        console.error(`Failed to release file lock for ${filePath}:`, error);
      }
    }
  }
}

module.exports = { documentFile }; 