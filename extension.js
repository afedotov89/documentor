/**
 * Extension for Visual Studio Code.
 * Generates documentation for project files and directories using ChatGPT.
 *
 * Main functions:
 * - activate: Initializes the extension and registers the command.
 * - deactivate: Deactivates the extension.
 */

const vscode = require('vscode');
const pathModule = require('path'); // This import can be left if needed in the future
const fs = require('fs');
const documentor = require('./documentor/documentGenerator.cjs');
const { indexManager } = require('./documentor/indexing/indexManager.cjs');

/**
 * Shows documentation for the selected resource in a new editor tab
 * @param {object} resource - The resource for which to show documentation
 */
async function showDocumentation(resource) {
  const fileInfo = documentor.getDocumentation(resource);
  
  if (!fileInfo) {
    vscode.window.showInformationMessage('No documentation for this file or directory.');
    return;
  }
  
  // Create a temporary file with documentation
  const content = [
    `# Documentation for ${resource.fsPath}`,
    `\n## Creation Date: ${new Date(fileInfo.timestamp).toLocaleString()}`,
    '\n## Docstring:',
    `\n${fileInfo.docstring || 'No docstring'}`,
    '\n## Detailed Description:',
    `\n${fileInfo.description || 'No description'}`
  ].join('\n');
  
  // Create a new document
  const doc = await vscode.workspace.openTextDocument({
    content: content,
    language: 'markdown'
  });
  
  // Show document
  await vscode.window.showTextDocument(doc);
}

/**
 * Selects a project to clear the index
 * @returns {Promise<string|null>} Path to the selected project or null if canceled
 */
async function selectProjectForClearIndex() {
  const projects = indexManager.getIndexedProjects();
  
  if (projects.length === 0) {
    vscode.window.showInformationMessage('No indexed projects.');
    return null;
  }
  
  // If only one project is open, use it
  if (projects.length === 1) {
    return projects[0].path;
  }
  
  // Create a list of projects to choose from
  const items = projects.map(project => ({
    label: project.name,
    description: project.path,
    projectPath: project.path
  }));
  
  // Add the "All Projects" option
  items.unshift({
    label: 'All Projects',
    description: 'Clear indices for all projects',
    projectPath: 'ALL'
  });
  
  // Show selection dialog
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project to clear the index'
  });
  
  return selected ? selected.projectPath : null;
}

/**
 * Selects a project to view indexed files
 * @returns {Promise<string|null>} Path to the selected project or null if canceled
 */
async function selectProjectForViewIndex() {
  const projects = indexManager.getIndexedProjects();
  
  if (projects.length === 0) {
    vscode.window.showInformationMessage('No indexed projects.');
    return null;
  }
  
  // If only one project is open, use it
  if (projects.length === 1) {
    return projects[0].path;
  }
  
  // Create a list of projects to choose from
  const items = projects.map(project => ({
    label: project.name,
    description: project.path,
    projectPath: project.path
  }));
  
  // Show selection dialog
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project to view the index'
  });
  
  return selected ? selected.projectPath : null;
}

/**
 * Gets a list of all indexed files in the selected project
 * @param {string} projectPath - Path to the project directory
 * @returns {Promise<Array<object>>} Array of objects with file information
 */
async function getIndexedFilesInProject(projectPath) {
  const projectId = indexManager.getProjectId(projectPath);
  const projectIndexDir = pathModule.join(indexManager.baseIndexDir, projectId);
  const results = [];
  
  if (!fs.existsSync(projectIndexDir)) {
    return results;
  }
  
  // Recursive function to traverse the directory
  async function traverseDirectory(dir, baseDir) {
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = pathModule.join(dir, entry);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        await traverseDirectory(fullPath, baseDir);
      } else if (stats.isFile() && entry.endsWith('.json')) {
        try {
          const data = fs.readFileSync(fullPath, 'utf8');
          const fileInfo = JSON.parse(data);
          
          // Add file information to results
          results.push({
            filePath: fileInfo.filePath,
            indexPath: fullPath,
            timestamp: fileInfo.timestamp,
            docstring: fileInfo.docstring,
            description: fileInfo.description
          });
        } catch (error) {
          console.error(`Error reading index file ${fullPath}: ${error.message}`);
        }
      }
    }
  }
  
  await traverseDirectory(projectIndexDir, projectIndexDir);
  return results;
}

/**
 * Shows a list of all indexed files for the selected project
 */
async function showIndexedFiles() {
  const projectPath = await selectProjectForViewIndex();
  
  if (!projectPath) {
    return; // User canceled selection
  }
  
  const indexedFiles = await getIndexedFilesInProject(projectPath);
  
  if (indexedFiles.length === 0) {
    vscode.window.showInformationMessage('There are no indexed files in this project.');
    return;
  }
  
  // Create a list of files to choose from
  const items = indexedFiles.map(file => ({
    label: pathModule.basename(file.filePath),
    description: `Updated: ${new Date(file.timestamp).toLocaleString()}`,
    detail: file.filePath,
    fileInfo: file
  }));
  
  // Show selection dialog
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a file to view documentation',
    matchOnDescription: true,
    matchOnDetail: true
  });
  
  if (selected) {
    // Format documentation for the selected file
    const content = [
      `# Documentation for ${selected.fileInfo.filePath}`,
      `\n## Creation Date: ${new Date(selected.fileInfo.timestamp).toLocaleString()}`,
      '\n## Docstring:',
      `\n${selected.fileInfo.docstring || 'No docstring'}`,
      '\n## Detailed Description:',
      `\n${selected.fileInfo.description || 'No description'}`
    ].join('\n');
    
    // Create a new document
    const doc = await vscode.workspace.openTextDocument({
      content: content,
      language: 'markdown'
    });
    
    // Show document
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Extension activation.
 * Registers the 'extension.documentor' command for resource processing.
 *
 * @param {Object} context - Extension context.
 */
function activate(context) {
  // Register command for creating documentation
  let disposable = vscode.commands.registerCommand('extension.documentor', async (resource) => {
    await documentor.documentResource(resource);
  });
  context.subscriptions.push(disposable);
  
  // Register command for showing documentation
  let showDocCmd = vscode.commands.registerCommand('extension.showDocumentation', async (resource) => {
    await showDocumentation(resource);
  });
  context.subscriptions.push(showDocCmd);
  
  // Register command for clearing the index
  let clearIndexCmd = vscode.commands.registerCommand('extension.clearDocumentationIndex', async () => {
    // Ask the user which project to clear
    const projectPath = await selectProjectForClearIndex();
    
    if (!projectPath) {
      return; // User canceled selection
    }
    
    if (projectPath === 'ALL') {
      // Clear all projects
      const projects = indexManager.getIndexedProjects();
      for (const project of projects) {
        indexManager.clearProjectIndex(project.path);
      }
      vscode.window.showInformationMessage('All project indices cleared.');
    } else {
      // Clear the selected project
      indexManager.clearProjectIndex(projectPath);
      vscode.window.showInformationMessage(`Project index cleared: ${pathModule.basename(projectPath)}`);
    }
  });
  context.subscriptions.push(clearIndexCmd);
  
  // Register command for viewing all indexed files
  let listIndexedFilesCmd = vscode.commands.registerCommand('extension.listIndexedFiles', async () => {
    await showIndexedFiles();
  });
  context.subscriptions.push(listIndexedFilesCmd);
}

/**
 * Deactivation of the extension.
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
}; 
