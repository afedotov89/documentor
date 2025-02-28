/**
 * VSCode command for generating README.md from project index
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { generateProjectReadme } = require('../documenting/documentReadme.cjs');

/**
 * Shows section selection UI to the user
 * @param {Array} availableSections - Available section keys
 * @param {Object} sectionTitles - Mapping of section keys to titles
 * @returns {Promise<Array>} Array of selected section keys
 */
async function showSectionSelector(availableSections, sectionTitles) {
  const quickPickItems = availableSections.map(key => ({
    label: sectionTitles[key],
    description: key,
    picked: true // Initially select all sections
  }));
  
  const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
    canPickMany: true,
    placeHolder: 'Select README sections to generate (all selected by default)'
  });
  
  if (!selectedItems) {
    return []; // User cancelled
  }
  
  return selectedItems.map(item => item.description);
}

/**
 * Executes the README generation command
 * @param {vscode.ExtensionContext} context - Extension context
 */
async function execute(context) {
  // Get the workspace folder
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a project folder first.');
    return;
  }
  
  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const projectPath = workspaceFolder.uri.fsPath;
  
  // Default section titles
  const sectionTitles = {
    'project-title': 'Project Overview',
    'overview': 'Introduction',
    'features': 'Key Features',
    'requirements': 'System Requirements',
    'installation': 'Installation Guide',
    'usage-examples': 'Usage Guide',
    'configuration': 'Configuration',
    'api': 'API Reference',
    'testing': 'Testing Instructions',
    'deployment': 'Deployment Guide',
    'structure': 'Project Structure',
    'license': 'License Information',
    'contributing': 'Contribution Guidelines',
    'authors': 'Team & Contributors'
  };
  
  try {
    // Get the shared output channel instead of creating a new one
    const documentGenerator = require('../documentGenerator.cjs');
    const outputChannel = documentGenerator.getOutputChannel();
    outputChannel.show();
    
    // Show progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating README.md',
        cancellable: false
      },
      async (progress) => {
        // Get sections to generate
        progress.report({ message: 'Selecting sections...' });
        const sectionsToGenerate = await showSectionSelector(Object.keys(sectionTitles), sectionTitles);
        
        if (sectionsToGenerate.length === 0) {
          vscode.window.showInformationMessage('README generation cancelled.');
          return;
        }
        
        // Generate README
        progress.report({ message: 'Analyzing project and generating content...' });
        outputChannel.appendLine('Starting README generation...');
        
        const readmeContent = await generateProjectReadme(
          projectPath,
          sectionsToGenerate,
          {
            sectionTitles,
            maxIterations: 2
          }
        );
        
        // Save README
        progress.report({ message: 'Saving README.md...' });
        const readmePath = path.join(projectPath, 'README.md');
        
        // Ask for confirmation before overwriting existing README
        if (fs.existsSync(readmePath)) {
          const overwrite = await vscode.window.showWarningMessage(
            'README.md already exists. Do you want to overwrite it?',
            'Overwrite',
            'Save as New File',
            'Cancel'
          );
          
          if (overwrite === 'Cancel') {
            vscode.window.showInformationMessage('README generation cancelled.');
            return;
          }
          
          if (overwrite === 'Save as New File') {
            const newReadmePath = path.join(projectPath, 'README-generated.md');
            fs.writeFileSync(newReadmePath, readmeContent, 'utf8');
            
            // Open the new file in the editor
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(newReadmePath));
            await vscode.window.showTextDocument(document);
            
            vscode.window.showInformationMessage(`README saved as ${path.basename(newReadmePath)}`);
            return;
          }
        }
        
        // Save or overwrite README.md
        fs.writeFileSync(readmePath, readmeContent, 'utf8');
        
        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(readmePath));
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage('README.md generated successfully!');
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating README: ${error.message}`);
    console.error('README generation error:', error);
  }
}

module.exports = {
  execute
}; 