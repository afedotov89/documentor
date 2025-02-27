const fs = require('fs');
const { indexDirectory } = require('./directoryIndexer.cjs');
const { indexFile } = require('./fileIndexer.cjs');
const { indexManager } = require('./indexManager.cjs');
const { isPathIgnored } = require('../config/ignorePatterns.cjs');

/**
 * Processes a file or directory path
 * @param {string} currentPath - Path to the file or directory
 * @param {object} outputChannel - VSCode output channel
 * @param {string[]} [customIgnorePatterns] - Optional array of custom ignore patterns
 * @returns {Promise<string>} - Returns documentation or description
 */
async function indexPath(currentPath, outputChannel, customIgnorePatterns = []) {
  // Check if path should be ignored
  if (isPathIgnored(currentPath, customIgnorePatterns)) {
    console.log(`Path ${currentPath} is ignored`);
    return null;
  }

  // Check if current information exists in the index
  if (indexManager.isFileInfoValid(currentPath)) {
    const fileInfo = indexManager.getFileInfo(currentPath);
    return fileInfo;
  }
  
  // If there is no current information in the index, process the path in the standard way
  const stats = await fs.promises.stat(currentPath);
  if (stats.isDirectory()) {
    return indexDirectory(currentPath, outputChannel, customIgnorePatterns);
  } else if (stats.isFile()) {
    return indexFile(currentPath, outputChannel);
  } else {
    throw new Error('Unsupported file type');
  }
}

module.exports = { indexPath }; 