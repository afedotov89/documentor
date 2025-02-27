const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Attempt to connect vscode module; if not available (during testing), use a stub
let vscode;
try {
  vscode = require('vscode');
} catch (error) {
  vscode = {
    workspace: {
      getConfiguration: () => ({
        get: () => undefined
      }),
      workspaceFolders: []
    },
    window: {
      showErrorMessage: (msg) => console.error(msg)
    }
  };
}

/**
 * Gets the base directory for storing documentation indexes
 * @returns {string} Path to the index directory
 */
function getBaseIndexDirectory() {
  // In working mode, use the global storage folder from vscode
  if (vscode.workspace && vscode.extensions) {
    const extensionPath = vscode.extensions.getExtension('yourname.documentor')?.extensionPath;
    if (extensionPath) {
      return path.join(extensionPath, 'docIndexes');
    }
  }
  
  // For testing, use a temporary directory
  const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
  return path.join(tempDir, 'documentor-indexes');
}

class IndexManager {
  constructor() {
    this.baseIndexDir = getBaseIndexDirectory();
    this.ensureDirExists(this.baseIndexDir);
  }

  /**
   * Creates a directory if it doesn't exist
   * @param {string} dir - Path to the directory
   */
  ensureDirExists(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Converts an absolute path to a project identifier
   * @param {string} absolutePath - Absolute path to a file or directory
   * @returns {string} Project identifier
   */
  getProjectId(absolutePath) {
    // Get the root directory of the project
    let projectRoot = '';
    
    if (vscode.workspace && vscode.workspace.workspaceFolders) {
      // Find the workspace folder to which absolutePath belongs
      for (const folder of vscode.workspace.workspaceFolders) {
        if (folder && folder.uri && folder.uri.fsPath && absolutePath.startsWith(folder.uri.fsPath) &&
           (projectRoot === '' || folder.uri.fsPath.length > projectRoot.length)) {
          projectRoot = folder.uri.fsPath;
        }
      }
    }
    
    if (!projectRoot) {
      // If workspace folder not found, use parent directory
      projectRoot = path.dirname(absolutePath);
      
      // Go up the directory tree until we find .git, package.json, or another project marker
      while (projectRoot && projectRoot !== path.dirname(projectRoot)) {
        if (fs.existsSync(path.join(projectRoot, '.git')) || 
            fs.existsSync(path.join(projectRoot, 'package.json'))) {
          break;
        }
        projectRoot = path.dirname(projectRoot);
      }
    }
    
    // Hash the project path to create a unique identifier
    const hash = crypto.createHash('md5').update(projectRoot).digest('hex');
    return hash.substring(0, 8) + '-' + path.basename(projectRoot);
  }

  /**
   * Creates a path to the metadata file relative to the index root
   * @param {string} absolutePath - Absolute path to the file or directory
   * @returns {Object} Object with paths for working with the index
   */
  getIndexFilePaths(absolutePath) {
    const projectId = this.getProjectId(absolutePath);
    const projectIndexDir = path.join(this.baseIndexDir, projectId);
    
    // Get the root directory of the project
    let projectRoot = '';
    
    if (vscode.workspace && vscode.workspace.workspaceFolders) {
      // Find the workspace folder to which absolutePath belongs
      for (const folder of vscode.workspace.workspaceFolders) {
        const folderPath = folder.uri.fsPath;
        if (absolutePath.startsWith(folderPath) && 
            (projectRoot === '' || folderPath.length > projectRoot.length)) {
          projectRoot = folderPath;
        }
      }
    }
    
    // If workspace folder not found, try to determine the project root
    if (!projectRoot) {
      projectRoot = path.dirname(absolutePath);
      
      // Go up the directory tree until we find .git, package.json, or another project marker
      while (projectRoot && projectRoot !== path.dirname(projectRoot)) {
        if (fs.existsSync(path.join(projectRoot, '.git')) || 
            fs.existsSync(path.join(projectRoot, 'package.json'))) {
          break;
        }
        projectRoot = path.dirname(projectRoot);
      }
    }
    
    // Create a relative path from the project root
    let relativePath = absolutePath;
    if (projectRoot && absolutePath.startsWith(projectRoot)) {
      relativePath = absolutePath.substring(projectRoot.length);
      // Remove initial separator if it exists
      if (relativePath.startsWith(path.sep)) {
        relativePath = relativePath.substring(1);
      }
    }
    
    // Replace path separators with platform-independent ones
    relativePath = relativePath.split(path.sep).join('_');
    
    // Create path to the index file
    const indexFilePath = path.join(projectIndexDir, relativePath + '.json');
    
    return {
      projectIndexDir,
      indexFilePath
    };
  }

  /**
   * Adds or updates information about a file or directory in the index
   * @param {string} filePath - Path to the file or directory
   * @param {string} docstring - Documentation (docstring)
   * @param {string} description - Detailed description
   * @param {Array<Object>} [members] - Array of objects containing the type and short description of the file or directory contents
   * The isDirectory flag indicates whether the path is a directory
   * @returns {Object} - Object with information about the file or directory
   */
  updateFileInfo(filePath, docstring, description, members) {
    const normalizedPath = path.normalize(filePath);
    const { projectIndexDir, indexFilePath } = this.getIndexFilePaths(normalizedPath);
    
    // Create the project directory if it doesn't exist
    this.ensureDirExists(projectIndexDir);
    
    // Create the file directory if it doesn't exist
    this.ensureDirExists(path.dirname(indexFilePath));
    
    // Determine if the path is a directory
    let isDirectory = false;
    if (fs.existsSync(normalizedPath)) {
      try {
        isDirectory = fs.lstatSync(normalizedPath).isDirectory();
      } catch (error) {
        console.error(`Error determining file type: ${error.message}`);
      }
    }
    
    // Create an object with metadata
    const fileInfo = {
      filePath: normalizedPath,
      docstring: docstring || '',
      description: description || '',
      members: members || [],
      isDirectory: isDirectory,
      timestamp: Date.now()
    };
    
    try {
      // Write information to the file
      fs.writeFileSync(indexFilePath, JSON.stringify(fileInfo, null, 2), 'utf8');
    } catch (error) {
      console.error(`Error saving metadata: ${error.message}`);
      if (vscode.window) {
        vscode.window.showErrorMessage(`Failed to save metadata: ${error.message}`);
      }
    }
    return fileInfo;
  }

  /**
   * Gets information about a file or directory from the index
   * @param {string} filePath - Path to the file or directory
   * @returns {Object|null} - Information about the file or directory, including isDirectory, or null if not found
   */
  getFileInfo(filePath) {
    const normalizedPath = path.normalize(filePath);
    const { indexFilePath } = this.getIndexFilePaths(normalizedPath);
    
    try {
      if (fs.existsSync(indexFilePath)) {
        const data = fs.readFileSync(indexFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Error reading metadata: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Checks if an entry for a file exists and if it is up-to-date
   * @param {string} filePath - Path to the file
   * @param {number} maxAgeMs - Maximum age of the entry in milliseconds (default 7 days)
   * @returns {boolean} - true if the entry exists and is not outdated
   */
  isFileInfoValid(filePath, maxAgeMs = 0) {
    const fileInfo = this.getFileInfo(filePath);
    if (!fileInfo) return false;
    
    const now = Date.now();
    const age = now - fileInfo.timestamp;
    return age <= maxAgeMs;
  }

  /**
   * Removes information about a file from the index
   * @param {string} filePath - Path to the file
   */
  removeFileInfo(filePath) {
    const normalizedPath = path.normalize(filePath);
    const { indexFilePath } = this.getIndexFilePaths(normalizedPath);
    
    try {
      if (fs.existsSync(indexFilePath)) {
        fs.unlinkSync(indexFilePath);
      }
    } catch (error) {
      console.error(`Error deleting metadata: ${error.message}`);
    }
  }

  /**
   * Clears the entire index for the specified project
   * @param {string} projectPath - Path to the project (if not specified, the current project is cleared)
   */
  clearProjectIndex(projectPath) {
    // If the path is not specified, use the first VSCode workspace folder
    if (!projectPath && vscode.workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    
    if (projectPath) {
      const projectId = this.getProjectId(projectPath);
      const projectIndexDir = path.join(this.baseIndexDir, projectId);
      
      if (fs.existsSync(projectIndexDir)) {
        try {
          // Recursively delete the project directory
          this.removeDirectory(projectIndexDir);
        } catch (error) {
          console.error(`Error clearing project index: ${error.message}`);
          if (vscode.window) {
            vscode.window.showErrorMessage(`Failed to clear project index: ${error.message}`);
          }
        }
      }
    }
  }

  /**
   * Recursively deletes a directory and all its contents
   * @param {string} dir - Path to the directory
   */
  removeDirectory(dir) {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(file => {
        const curPath = path.join(dir, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          // Recursively delete subdirectories
          this.removeDirectory(curPath);
        } else {
          // Delete files
          fs.unlinkSync(curPath);
        }
      });
      // Delete the empty directory
      fs.rmdirSync(dir);
    }
  }

  /**
   * Gets a list of all projects for which there are indexes
   * @returns {Array<Object>} Array of objects with project information
   */
  getIndexedProjects() {
    const projects = [];
    
    try {
      if (fs.existsSync(this.baseIndexDir)) {
        fs.readdirSync(this.baseIndexDir).forEach(projectDir => {
          const projectPath = path.join(this.baseIndexDir, projectDir);
          if (fs.lstatSync(projectPath).isDirectory()) {
            const projectName = projectDir.split('-').slice(1).join('-');
            projects.push({
              id: projectDir,
              name: projectName,
              path: projectPath
            });
          }
        });
      }
    } catch (error) {
      console.error(`Error getting the list of projects: ${error.message}`);
    }
    
    return projects;
  }
}

// Create a single instance of the index manager for the entire plugin
const indexManager = new IndexManager();

module.exports = { indexManager }; 