/**
 * Extension for Visual Studio Code.
 * Generates documentation for project files and directories using ChatGPT.
 *
 * Main functions:
 * - activate: Initializes the extension and registers the command.
 * - deactivate: Deactivates the extension.
 */

const vscode = require('vscode');
const pathModule = require('path');
const fs = require('fs');
const documentor = require('./documentor/documentGenerator.cjs');
const { indexManager } = require('./documentor/indexing/indexManager.cjs');
const { generateStandardProjectDocumentation } = require('./documentor/documenting/index.cjs');

// Global variables
let exportPanel = undefined;
let statusBarItem = undefined;
// Глобальная переменная будет инициализирована через documentor.getOutputChannel

/**
 * Exports documentation for the current workspace/project
 */
async function exportProjectDocumentation() {
  // Get the root directory of the project
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder is open');
    return;
  }
  
  const resource = workspaceFolder.uri;
    
  // Export documentation
  await exportReadmeWithWebView(resource);
}

/**
 * Exports documentation for the selected resource to a file using WebView
 * @param {object} resource - The resource for which to export documentation
 */
async function exportReadmeWithWebView(resource) {
  
  // Get settings
  const config = vscode.workspace.getConfiguration('documentor');
  let defaultExportPath;
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder is open');
      return;
    }
    
    defaultExportPath = '${workspaceFolder}';
    defaultExportPath = defaultExportPath.replace(/\${workspaceFolder}/g, workspaceFolder);
  } catch (error) {
    vscode.window.showErrorMessage('Failed to process export path');
    return;
  }
  
  // Generate default filename - always README.md
  const defaultFilename = 'README.md';
  
  // Create or reuse WebView panel
  if (!exportPanel) {
    exportPanel = vscode.window.createWebviewPanel(
      'exportDocumentation',
      'Export Project Documentation',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(pathModule.join(vscode.extensions.getExtension('yourname.documentor').extensionPath, 'media'))
        ]
      }
    );
    
    // Handle panel closure
    exportPanel.onDidDispose(() => {
      exportPanel = undefined;
    });
  } else {
    exportPanel.reveal(vscode.ViewColumn.One);
  }
  
  // Get paths to resources
  const mediaPath = pathModule.join(vscode.extensions.getExtension('yourname.documentor').extensionPath, 'media');
  
  const cssUri = exportPanel.webview.asWebviewUri(
    vscode.Uri.file(pathModule.join(mediaPath, 'webview', 'styles.css'))
  );
  
  const mainJsUri = exportPanel.webview.asWebviewUri(
    vscode.Uri.file(pathModule.join(mediaPath, 'webview', 'main.js'))
  );
  
  // Read HTML template
  let htmlContent;
  try {
    htmlContent = fs.readFileSync(pathModule.join(mediaPath, 'webview', 'export-readme-form.html'), 'utf8');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load WebView HTML: ${error.message}`);
    return;
  }
  
  // Prepare default full path
  const defaultFullPath = pathModule.join(defaultExportPath, defaultFilename);
  
  // Replace placeholders
  htmlContent = htmlContent
    .replace('{{cssUri}}', cssUri)
    .replace('{{mainJsUri}}', mainJsUri)
    .replace('{{defaultExportPath}}', defaultFullPath);
  
  // Set HTML content
  exportPanel.webview.html = htmlContent;
  
  // Handle messages from WebView
  exportPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'webviewReady':
        // Send resource information to WebView
        exportPanel.webview.postMessage({
          command: 'setResourceInfo',
          resourceInfo: {
            filePath: resource.fsPath,
            fileName: pathModule.basename(resource.fsPath),
            defaultFilename: defaultFilename,
            exportPath: defaultExportPath,
            isProject: true
          }
        });
        break;
        
      case 'export':
        // Export documentation
        await handleExportFromWebView(resource, message.config, true);
        break;
        
      case 'cancel':
        // Close panel
        if (exportPanel) {
          exportPanel.dispose();
        }
        break;
        
      case 'getDirectories':
        // Get list of directories
        const directories = await getDirectoriesForPath(message.path);
        exportPanel.webview.postMessage({
          command: 'setDirectories',
          directories: directories
        });
        break;
        
      case 'showMessage':
        // Show message
        vscode.window.showInformationMessage(message.message);
        break;
    }
  });
}

/**
 * Handles documentation export from WebView
 * @param {object} resource - Resource to export
 * @param {object} fileInfo - File information
 * @param {object} config - Export configuration
 * @param {boolean} isProject - Flag indicating if we're exporting project documentation
 */
async function handleExportFromWebView(resource, config, isProject = true) {
  // Получаем единый output channel
  const outputChannel = documentor.getOutputChannel();
  
  // Display output channel when starting generation
  outputChannel.clear();
  outputChannel.show();
  outputChannel.appendLine(`Starting documentation generation for ${pathModule.basename(resource.fsPath)}...`);

  // Ensure the directory exists
  const fileInfo = await documentor.getDocumentation(resource);
  try {
    if (!fs.existsSync(config.exportDir)) {
      fs.mkdirSync(config.exportDir, { recursive: true });
      outputChannel.appendLine(`Created directory: ${config.exportDir}`);
    }
  } catch (error) {
    outputChannel.appendLine(`ERROR: Failed to create directory: ${error.message}`);
    vscode.window.showErrorMessage(`Failed to create directory: ${error.message}`);
    return;
  }

  // Construct the full file path
  const fullPath = pathModule.join(config.exportDir, config.filename);
  outputChannel.appendLine(`Target file: ${fullPath}`);

  // Check if file exists
  if (fs.existsSync(fullPath)) {
    const answer = await vscode.window.showWarningMessage(
      'File already exists. Do you want to replace it?',
      'Yes',
      'No'
    );
    
    if (answer !== 'Yes') {
      outputChannel.appendLine('User chose not to replace the existing file. Operation cancelled.');
      return;
    }
    outputChannel.appendLine('User confirmed file replacement.');
  }
  
  // Get selected sections from configuration
  const selectedSections = config.sections || [];
  outputChannel.appendLine(`Selected sections: ${selectedSections.join(', ') || 'All'}`);
  
  try {
    // Use standard documentation format with selected sections
    const content = await generateStandardProjectDocumentation(resource, fileInfo, selectedSections);

    // Write to file
    fs.writeFileSync(fullPath, content, 'utf8');
    outputChannel.appendLine(`Documentation successfully written to: ${fullPath}`);
    
    // Close WebView panel
    if (exportPanel) {
      exportPanel.dispose();
    }
    
    // Ask if user wants to open the file
    const openFile = await vscode.window.showInformationMessage(
      `Documentation exported to ${fullPath}`,
      'Open file',
      'OK'
    );
    
    if (openFile === 'Open file') {
      const openPath = vscode.Uri.file(fullPath);
      const doc = await vscode.workspace.openTextDocument(openPath);
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    outputChannel.appendLine(`ERROR: Failed to generate documentation: ${error.message}`);
    if (error.stack) {
      outputChannel.appendLine(`Stack trace: ${error.stack}`);
    }
    vscode.window.showErrorMessage(`Failed to generate documentation: ${error.message}`);
  }
}

/**
 * Gets list of directories for specified path
 * @param {string} dirPath - Path to directory
 * @returns {object} List of directories
 */
async function getDirectoriesForPath(dirPath) {
  try {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return {
        parentPath: null,
        items: []
      };
    }
    
    // Get list of files and directories
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Filter only directories
    const directories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: pathModule.join(dirPath, entry.name)
      }));
    
    // Get parent directory
    const parentPath = pathModule.dirname(dirPath) !== dirPath ? pathModule.dirname(dirPath) : null;
    
    return {
      parentPath: parentPath,
      items: directories
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Directory reading error: ${error.message}`);
    return {
      parentPath: null,
      items: []
    };
  }
}

/**
 * Extension activation.
 * Registers the 'extension.documentor' command for resource processing.
 *
 * @param {Object} context - Extension context.
 */
function activate(context) {
  // Create output channel and set it for the documentor module
  const outputChannel = vscode.window.createOutputChannel('Documentor');
  context.subscriptions.push(outputChannel);
  
  // Set the output channel in documentor module
  documentor.setOutputChannel(outputChannel);
  
  // Create status bar button
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBarItem.text = "$(book) Export Docs";
  statusBarItem.tooltip = "Export project documentation";
  statusBarItem.command = "extension.showDocumentorMenu";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  
  // Register command for creating documentation
  let disposable = vscode.commands.registerCommand('extension.documentor', async (resource) => {
    await documentor.documentResource(resource);
  });
  context.subscriptions.push(disposable);
  
  // Register new command for displaying documentation menu
  let showMenuCmd = vscode.commands.registerCommand('extension.showDocumentorMenu', async () => {
    await showDocumentorMenu(context);
  });
  context.subscriptions.push(showMenuCmd);
}

/**
 * Shows dropdown menu with options for exporting documentation
 * @param {Object} context - Extension context
 */
async function showDocumentorMenu(context) {
  const options = [
    { 
      label: "$(markdown) README.md", 
      description: "Export documentation to README.md",
      action: "readme"
    },
    // { 
    //   label: "$(book) Full documentation", 
    //   description: "Export full project documentation",
    //   action: "full" 
    // },
    // { 
    //   label: "$(file) Custom format...", 
    //   description: "Export to custom file",
    //   action: "custom" 
    // }
  ];

  const selected = await vscode.window.showQuickPick(options, { 
    placeHolder: 'Select documentation export type' 
  });

  if (!selected) {
    return; // User cancelled selection
  }

  // Process user selection
  switch (selected.action) {
    case 'readme':
    case 'full':
    case 'custom':
      // All documentation types are exported via WebView with README.md
      await exportProjectDocumentation();
      break;
  }
}


/**
 * Deactivation of the extension.
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
}; 
