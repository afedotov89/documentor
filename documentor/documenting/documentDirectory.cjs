const fs = require('fs');
const pathModule = require('path');
const { indexManager } = require('../indexing/indexManager.cjs');
const { indexPath } = require('../indexing/pathIndexer.cjs');
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

/**
 * Checks if any file within a directory has been modified since the last documentation time
 * @param {string} directoryPath - Path to the directory to check
 * @param {number} lastDocTime - Timestamp of the last documentation
 * @param {object} outputChannel - VSCode output channel
 * @returns {Promise<boolean>} - True if any file has been modified
 */
async function hasModifiedFiles(directoryPath, lastDocTime, outputChannel) {
  try {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = pathModule.join(directoryPath, entry.name);
      
      // Skip node_modules, .git and hidden directories
      if (entry.isDirectory() && (
          entry.name === 'node_modules' || 
          entry.name === '.git' || 
          entry.name.startsWith('.')
      )) {
        continue;
      }
      
      const stats = await fs.promises.stat(entryPath);
      
      if (Math.floor(stats.mtimeMs) > lastDocTime) {
        console.log(`Found modified file/directory: ${entryPath} (modified: ${new Date(stats.mtimeMs).toLocaleString()})`);
        return true;
      }
      
      // Recursive check for directories
      if (entry.isDirectory()) {
        const hasModified = await hasModifiedFiles(entryPath, lastDocTime, outputChannel);
        if (hasModified) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    outputChannel.appendLine(`Error checking for modified files in ${directoryPath}: ${error.message}`);
    // If there's an error, assume something changed to be safe
    return true;
  }
}

/**
 * Extracts an existing docstring from a Python __init__.py file if present.
 * @param {string} content - Content of the __init__.py file.
 * @returns {string|null} - The extracted docstring or null if not found.
 */
function getPythonInitDocstring(content) {
  const trimmed = content.trim();
  // Check for triple double quotes (standard in __init__.py)
  if (trimmed.startsWith('"""')) {
    const closingIndex = trimmed.indexOf('"""', 3);
    if (closingIndex !== -1) {
      return trimmed.slice(3, closingIndex).trim();
    }
  }
  return null;
}

/**
 * Adds a docstring to a Python __init__.py file.
 * @param {string} content - Original __init__.py content.
 * @param {string} description - Description to use in docstring.
 * @returns {string} - Updated file content with docstring.
 */
function addPythonInitDocstring(content, description) {
  return `"""\n${description}\n"""\n\n${content}`;
}

/**
 * Documents a Python package using __init__.py
 * @param {string} directoryPath - Path to the directory
 * @param {Object} directoryInfo - Directory information
 * @param {object} outputChannel - VSCode output channel
 * @returns {Promise<boolean>} - Documentation success
 */
async function documentPythonPackage(directoryPath, directoryInfo, outputChannel) {
  const initPyPath = pathModule.join(directoryPath, '__init__.py');
  console.log(`Directory ${directoryPath} is a Python package. Adding documentation to __init__.py`);
  
  try {
    // Read file contents
    const content = await fs.promises.readFile(initPyPath, 'utf8');
    
    // Check if docstring already exists in the file
    const existingDocstring = getPythonInitDocstring(content);
    if (existingDocstring !== null) {
      console.log(`File __init__.py already contains a docstring, leaving as is`);
      return true;
    }
    
    // Check if directory has a docstring before adding
    const docstring = directoryInfo && directoryInfo.docstring 
      ? directoryInfo.docstring 
      : `Python package: ${pathModule.basename(directoryPath)}`;
    
    // Add docstring to __init__.py
    const updatedContent = addPythonInitDocstring(content, docstring);
    await fs.promises.writeFile(initPyPath, updatedContent, 'utf8');
    outputChannel.appendLine(`Documentation added to ${directoryPath}/__init__.py`);
    return true;
  } catch (error) {
    outputChannel.appendLine(`Error documenting __init__.py: ${error.message}`);
    return false;
  }
}

/**
 * Documents a regular directory using README.md
 * @param {string} directoryPath - Path to the directory
 * @param {Object} directoryInfo - Directory information
 * @param {object} outputChannel - VSCode output channel
 * @returns {Promise<boolean>} - Documentation success
 */
async function documentRegularDirectory(directoryPath, directoryInfo, outputChannel) {
  const readmePath = pathModule.join(directoryPath, 'README.md');
  
  try {
    // Check if README.md exists
    let readmeExists = false;
    try {
      await fs.promises.access(readmePath);
      readmeExists = true;
    } catch (error) {
      // File doesn't exist, will create a new one
    }
    
    // Prepare README.md content
    let readmeContent = '';
    const dirName = pathModule.basename(directoryPath);
    const docHeader = `<!-- Documentor generated -->\n\n# ${dirName}\n\n${directoryInfo.description}\n\n<!-- End of Documentor generated -->`;
    
    if (readmeExists) {
      outputChannel.appendLine(`README.md file exists, checking if it needs updating`);
      // Read existing README.md and update it if needed
      const existingContent = await fs.promises.readFile(readmePath, 'utf8');
      
      // Check if README.md already contains a Documentor section
      const docSectionRegex = /<!-- Documentor generated -->[\s\S]*?<!-- End of Documentor generated -->/;
      if (docSectionRegex.test(existingContent)) {
        // Update existing Documentor section
        readmeContent = existingContent.replace(docSectionRegex, docHeader);
      } else {
        // Add Documentor section at the top of existing content
        readmeContent = `${docHeader}\n\n${existingContent}`;
      }
    }
    else {
      // Create a new README.md
      readmeContent = `${docHeader}\n`;
      outputChannel.appendLine(`Creating new README.md for ${directoryPath}`);
    }
    
    // Write updated README.md
    await fs.promises.writeFile(readmePath, readmeContent, 'utf8');
    outputChannel.appendLine(`Documentation added to README.md for ${directoryPath}`);
    return true;
  } catch (error) {
    outputChannel.appendLine(`Error creating/updating README.md: ${error.message}`);
    return false;
  }
}

/**
 * Determines if a directory is a Python package
 * @param {string} directoryPath - Path to the directory
 * @returns {Promise<boolean>} - true if it's a Python package
 */
async function isPythonPackage(directoryPath) {
  const initPyPath = pathModule.join(directoryPath, '__init__.py');
  try {
    await fs.promises.access(initPyPath);
    return true;
  } catch (error) {
    // If __init__.py is missing, check if all files in the directory have .py extension
    try {
      const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile());
      
      // Check that the directory has at least one .py file and all files have .py extension
      return files.length > 0 && files.some(file => file.name.endsWith('.py')) && 
             files.every(file => file.name.endsWith('.py'));
    } catch (err) {
      return false;
    }
  }
}

/**
 * Recursively processes directory contents
 * @param {string} directoryPath - Path to the directory
 * @param {object} outputChannel - VSCode output channel
 * @param {boolean} recursive - Recursive processing flag
 * @param {number} [currentDepth=0] - Current recursion depth
 * @param {number} [maxDepth=10] - Maximum recursion depth
 * @returns {Promise<Array<Object>>} - Array of documentation results for all processed files
 */
async function processDirectoryContents(directoryPath, outputChannel, recursive, currentDepth = 0, maxDepth = 10) {
  if (!recursive) return [];
  
  // Recursion depth limit to prevent stack overflow
  if (currentDepth >= maxDepth) {
    outputChannel.appendLine(`Maximum recursion depth (${maxDepth}) reached for ${directoryPath}. Stopping recursion.`);
    return [];
  }
  
  const results = [];
  
  try {
    const entries = await fs.promises.readdir(directoryPath);
    const { documentPath } = require('./documentPath.cjs');
    
    for (const entry of entries) {
      // Skip README.md and __init__.py
      if (entry === 'README.md' || entry === '__init__.py') continue;
      
      const fullPath = pathModule.join(directoryPath, entry);
      try {
        // Document the file and save the result
        const result = await documentPath(fullPath, outputChannel, recursive, currentDepth + 1, maxDepth);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        outputChannel.appendLine(`Error documenting ${fullPath}: ${error.message}`);
        results.push({
          success: false,
          path: fullPath,
          message: error.message,
          error
        });
      }
    }
  } catch (error) {
    outputChannel.appendLine(`Error processing directory contents ${directoryPath}: ${error.message}`);
  }
  
  return results;
}

/**
 * Adds documentation to a directory
 * @param {string} directoryPath - Path to the directory
 * @param {object} outputChannel - VSCode output channel
 * @param {boolean} recursive - Recursively process directory contents
 * @param {number} [currentDepth=0] - Current recursion depth
 * @param {number} [maxDepth=10] - Maximum recursion depth
 * @returns {Promise<Object>} - Directory documentation result
 */
async function documentDirectory(directoryPath, outputChannel, recursive = true, currentDepth = 0, maxDepth = 10) {
  let release;
  let documentationResult;
  let filesResults = []; // Store file processing results
  
  try {
    // First process the directory contents (recursively)
    if (recursive) {
      console.log(`Processing contents of directory: ${directoryPath} first`);
      filesResults = await processDirectoryContents(directoryPath, outputChannel, recursive, currentDepth, maxDepth);
    }
    
    // After processing the contents, get a lock for documenting the directory itself
    release = await lockManager.acquireLock(directoryPath, 'documentor_doc_dir', {
      retries: 3,
      stale: 300000 // 5 minutes for directories
    });
    
    console.log(`Acquired directory lock for documenting: ${directoryPath}`);
    
    try {
      
      // First index the directory to ensure we have up-to-date information
      const directoryInfo = await indexPath(directoryPath, outputChannel);

      if (!directoryInfo) {
        return {
          success: false,
          path: directoryPath,
          type: 'directory',
          message: 'Skipping directory',
        };
      }

      // After processing all nested files, check if we need to document the directory itself
      const dirStats = await fs.promises.stat(directoryPath);
      const lastModifiedTime = Math.floor(dirStats.mtimeMs);
      const lastDocTime = directoryInfo.lastDocumentedTime || 0;
      
      // Check if there were changes in the directory itself
      const filesModified = await hasModifiedFiles(directoryPath, lastDocTime, outputChannel);
      const contentChanged = filesModified || (lastModifiedTime > lastDocTime);
      
      // If the directory and its files haven't changed since the last documentation, skip
      if (lastDocTime && !contentChanged) {
        console.log(`Directory "${directoryPath}" and its contents have not changed since last documentation (${new Date(lastDocTime).toLocaleString()}). Skipping directory documentation.`);
        documentationResult = { 
          success: true, 
          path: directoryPath, 
          type: 'directory', 
          message: 'Not modified since last documentation, skipped',
          filesResults: filesResults
        };
        return documentationResult;
      }
      
      if (filesModified) {
        console.log(`Files inside "${directoryPath}" have been modified. Documenting directory.`);
      } else if (lastModifiedTime > lastDocTime) {
        console.log(`Directory "${directoryPath}" itself has been modified. Documenting directory.`);
      }
      outputChannel.appendLine(`Documenting directory: ${directoryPath}`);

      // Determine the directory type and document it accordingly
      const pythonPackage = await isPythonPackage(directoryPath);
      
      let documentationSuccess = false;
      if (pythonPackage) {
        documentationSuccess = await documentPythonPackage(directoryPath, directoryInfo, outputChannel);
      } else {
        documentationSuccess = await documentRegularDirectory(directoryPath, directoryInfo, outputChannel);
      }
      
      // Update the last documentation time for this directory in the index
      if (documentationSuccess && directoryInfo) {
        directoryInfo.lastDocumentedTime = Date.now();
        indexManager.updateFileInfo(directoryPath, directoryInfo);
        console.log(`Updated last documented time for directory "${directoryPath}"`);
      }
      
      documentationResult = { 
        success: true, 
        path: directoryPath, 
        type: 'directory', 
        message: 'Directory successfully documented',
        filesResults: filesResults
      };
    } catch (error) {
      outputChannel.appendLine(`Error documenting directory ${directoryPath}: ${error.message}`);
      documentationResult = { 
        success: false, 
        path: directoryPath, 
        type: 'directory', 
        message: error.message, 
        error,
        filesResults: filesResults
      };
    }
  } catch (error) {
    if (error.code === 'ELOCKED') {
      console.log(`Directory ${directoryPath} is currently being documented by another process`);
      documentationResult = { 
        success: false, 
        path: directoryPath, 
        type: 'directory', 
        message: 'Directory is being documented by another process',
        filesResults: filesResults
      };
    } else {
      outputChannel.appendLine(`Error in documenting directory ${directoryPath}: ${error.message}`);
      documentationResult = { 
        success: false, 
        path: directoryPath, 
        type: 'directory', 
        message: error.message, 
        error,
        filesResults: filesResults
      };
    }
  } finally {
    if (release) {
      // Release the lock after completion
      try {
        await release();
        console.log(`Released directory lock for documenting: ${directoryPath}`);
      } catch (error) {
        console.error(`Failed to release directory lock for ${directoryPath}:`, error);
      }
    }
  }
  
  return documentationResult;
}

module.exports = { documentDirectory, hasModifiedFiles };