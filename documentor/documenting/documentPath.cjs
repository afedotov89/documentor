const fs = require('fs');
const { documentDirectory } = require('./documentDirectory.cjs');
const { documentFile } = require('./documentFile.cjs');
const { indexManager } = require('../indexing/indexManager.cjs');

/**
 * Processes a file or directory path for adding documentation
 * @param {string} currentPath - Path to the file or directory
 * @param {object} outputChannel - VSCode output channel
 * @param {boolean} recursive - Process directory contents recursively
 * @param {number} [currentDepth=0] - Current recursion depth
 * @param {number} [maxDepth=10] - Maximum recursion depth
 * @returns {Promise<Object>} - Documentation result
 */
async function documentPath(currentPath, outputChannel, recursive = true, currentDepth = 0, maxDepth = 10) {
  try {
    // Get file stats to determine file type
    const stats = await fs.promises.stat(currentPath);
    
    if (stats.isDirectory()) {
      return documentDirectory(currentPath, outputChannel, recursive, currentDepth, maxDepth);
    } else if (stats.isFile()) {
      return documentFile(currentPath, outputChannel);
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    outputChannel.appendLine(`Error documenting "${currentPath}": ${error.message}`);
    return { success: false, message: error.message, error };
  }
}

module.exports = { documentPath }; 