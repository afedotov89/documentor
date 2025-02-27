const fs = require('fs');
const { documentDirectory } = require('./documentDirectory.cjs');
const { documentFile } = require('./documentFile.cjs');
const { indexManager } = require('../indexing/indexManager.cjs');

/**
 * Processes a file or directory path for adding documentation
 * @param {string} currentPath - Path to the file or directory
 * @param {object} outputChannel - VSCode output channel
 * @param {boolean} recursive - Process directory contents recursively
 * @returns {Promise<Object>} - Documentation result
 */
async function documentPath(currentPath, outputChannel, recursive = true) {
  // Get path information from the index
  const fileInfo = indexManager.getFileInfo(currentPath);
  
  if (!fileInfo) {
    outputChannel.appendLine(`Information for "${currentPath}" not found in the index`);
    return { success: false, message: 'Information not found in the index' };
  }
  
  try {
    const stats = await fs.promises.stat(currentPath);
    
    if (stats.isDirectory()) {
      return documentDirectory(currentPath, fileInfo, outputChannel, recursive);
    } else if (stats.isFile()) {
      return documentFile(currentPath, fileInfo, outputChannel);
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    outputChannel.appendLine(`Error documenting "${currentPath}": ${error.message}`);
    return { success: false, message: error.message, error };
  }
}

module.exports = { documentPath }; 