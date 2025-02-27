const fs = require('fs');
const pathModule = require('path');
const { addDocumentation } = require('../utils.js');

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

/**
 * Adds documentation to a file
 * @param {string} filePath - Path to the file
 * @param {Object} fileInfo - File information from the index
 * @param {object} outputChannel - VSCode output channel
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @returns {Promise<Object>} - File documentation result
 */
async function documentFile(filePath, fileInfo, outputChannel) {
  outputChannel.appendLine(`Documenting file: ${filePath}`);
  
  try {
    // Check file extension
    const ext = pathModule.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      outputChannel.appendLine(`Skipping unsupported file type: ${filePath}`);
      return {
        success: false,
        path: filePath,
        type: 'file',
        message: 'Unsupported file type'
      };
    }

    // Read file content
    const content = await fs.promises.readFile(filePath, 'utf8');
  
    const configSettings = vscode.workspace.getConfiguration();
    const apiKey = configSettings.get('OpenAI API Key');
    const model = configSettings.get('model');
    if (!apiKey) {
      outputChannel.appendLine('Error: API key is missing from the configuration.');
      vscode.window.showErrorMessage('Error: API key is missing from the configuration.');
      throw new Error('API key is missing from the configuration.');
    }
    const ChatGPTClient = require('../../openaiClient.cjs');
    const client = new ChatGPTClient(apiKey, model);


    // Get the new content with added documentation
    const newContent = await addDocumentation(client, filePath, content);
    
    // Write the updated content back to the file
    await fs.promises.writeFile(filePath, newContent, 'utf8');
    
    outputChannel.appendLine(`Documentation added to file ${filePath}`);
    return { 
      success: true, 
      path: filePath, 
      type: 'file', 
      message: 'File successfully documented' 
    };
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
}

module.exports = { documentFile }; 