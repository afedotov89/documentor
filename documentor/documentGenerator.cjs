const fs = require('fs');
const pathModule = require('path');
const { indexManager } = require('./indexing/indexManager.cjs');
// Inject vscode dependency
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
            appendLine: (message) => console.log(`[OutputChannel ${name}]: ${message}`),
          }),
          showErrorMessage: (msg) => console.error('vscode.showErrorMessage:', msg),
          showInformationMessage: (msg) => console.log('vscode.showInformationMessage:', msg)
        }
      };
    }
  }
  return _vscode;
}

// Export setter for vscode - this allows to replace the module in tests
function setVscode(newVscode) {
  _vscode = newVscode;
}

const { indexPath } = require('./indexing/pathIndexer.cjs');
const { documentPath } = require('./documenting/documentPath.cjs');
// Remove global channel creation
// const outputChannel = getVscode().window.createOutputChannel('DocGenerator');

//
// Function for lazy channel initialization (can be skipped if you prefer to create channel on each call)
//
let _outputChannel = null;
function getOutputChannel() {
  if (!_outputChannel) {
    _outputChannel = getVscode().window.createOutputChannel('Documentor');
  }
  return _outputChannel;
}

/**
 * Documents a file or directory
 * @param {object} resource - Resource to create documentation for
 * @returns {Promise<void>}
 */
async function documentResource(resource) {
  const filePath = resource.fsPath;
  // Add output to _outputChannel in English
  const outputChannel = getOutputChannel();
  outputChannel.show(true); // Open channel
  
  try {
    // Index the path
    await indexPath(filePath, outputChannel);
    await documentPath(filePath, outputChannel);
    
    getVscode().window.showInformationMessage(`Documentation successfully created for: ${filePath}`);
  } catch (err) {
    console.error("Error processing file: ", err);
    getVscode().window.showErrorMessage(err.message);
  }
}

/**
 * Gets documentation for a resource from the index
 * @param {object} resource - Resource to get documentation for
 * @returns {object|null} - Object with docstring and description or null if no information is available
 */
function getDocumentation(resource) {
  const filePath = resource.fsPath;
  return indexManager.getFileInfo(filePath);
}

/**
 * Checks if documentation exists for a resource
 * @param {object} resource - Resource to check
 * @returns {boolean} - true if documentation exists
 */
function hasDocumentation(resource) {
  const filePath = resource.fsPath;
  return indexManager.isFileInfoValid(filePath);
}

module.exports = { documentResource, getDocumentation, hasDocumentation, setVscode }; 