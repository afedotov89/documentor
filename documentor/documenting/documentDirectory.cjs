const fs = require('fs');
const pathModule = require('path');
const { indexManager } = require('../indexing/indexManager.cjs');

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
  outputChannel.appendLine(`Directory ${directoryPath} is a Python package. Adding documentation to __init__.py`);
  
  try {
    // Read file contents
    const content = await fs.promises.readFile(initPyPath, 'utf8');
    
    // Check if docstring already exists in the file
    const existingDocstring = getPythonInitDocstring(content);
    if (existingDocstring !== null) {
      outputChannel.appendLine(`File __init__.py already contains a docstring, leaving as is`);
      return true;
    }
    
    // Add docstring to __init__.py
    const updatedContent = addPythonInitDocstring(content, directoryInfo.docstring);
    await fs.promises.writeFile(initPyPath, updatedContent, 'utf8');
    outputChannel.appendLine(`Documentation added to __init__.py for ${directoryPath}`);
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
      outputChannel.appendLine(`README.md file exists, not modifying it`);
    }
    else {
      // Create a new README.md
      readmeContent = `${docHeader}\n`;
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
      if (files.length > 0 && files.every(file => file.name.endsWith('.py'))) {
        return true;
      }
      return false;
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
 */
async function processDirectoryContents(directoryPath, outputChannel, recursive) {
  if (!recursive) return;
  
  try {
    const entries = await fs.promises.readdir(directoryPath);
    const { documentPath } = require('./documentPath.cjs');
    
    for (const entry of entries) {
      // Skip README.md and __init__.py
      if (entry === 'README.md' || entry === '__init__.py') continue;
      
      const fullPath = pathModule.join(directoryPath, entry);
      try {
        await documentPath(fullPath, outputChannel, recursive);
      } catch (error) {
        outputChannel.appendLine(`Error documenting ${fullPath}: ${error.message}`);
      }
    }
  } catch (error) {
    outputChannel.appendLine(`Error processing directory contents ${directoryPath}: ${error.message}`);
  }
}

/**
 * Adds documentation to a directory
 * @param {string} directoryPath - Path to the directory
 * @param {Object} directoryInfo - Directory information from the index
 * @param {object} outputChannel - VSCode output channel
 * @param {boolean} recursive - Recursively process directory contents
 * @returns {Promise<Object>} - Directory documentation result
 */
async function documentDirectory(directoryPath, directoryInfo, outputChannel, recursive = true) {
  outputChannel.appendLine(`Documenting directory: ${directoryPath}`);
  
  try {
    // Determine directory type and document accordingly
    const pythonPackage = await isPythonPackage(directoryPath);
    
    let documentationSuccess = false;
    if (pythonPackage) {
      documentationSuccess = await documentPythonPackage(directoryPath, directoryInfo, outputChannel);
    } else {
      // documentationSuccess = await documentRegularDirectory(directoryPath, directoryInfo, outputChannel);
      // TODO: uncomment this when we have a way to handle non-Python directories
      documentationSuccess = true;
    }
    
    // Recursively process directory contents
    if (recursive) {
      await processDirectoryContents(directoryPath, outputChannel, recursive);
    }
    
    return { 
      success: true, 
      path: directoryPath, 
      type: 'directory', 
      message: 'Directory successfully documented' 
    };
  } catch (error) {
    outputChannel.appendLine(`Error documenting directory ${directoryPath}: ${error.message}`);
    return { 
      success: false, 
      path: directoryPath, 
      type: 'directory', 
      message: error.message, 
      error 
    };
  }
}

module.exports = { documentDirectory }; 