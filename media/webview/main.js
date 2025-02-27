(function() {
    // Get access to VSCode API
    const vscode = acquireVsCodeApi();
    
    // Create a basic object for working with paths
    const pathModule = {
        join: function(dir, file) {
            // Simple implementation for joining a path and a filename
            if (!dir) return file;
            if (!file) return dir;
            
            // Handling different variants of slashes
            const dirEndsWithSlash = dir.endsWith('/') || dir.endsWith('\\');
            const separator = dirEndsWithSlash ? '' : '/';
            
            return dir + separator + file;
        },
        dirname: function(path) {
            // Getting directory from a path
            if (!path) return '';
            
            // Check for slashes
            if (path.includes('/')) {
                // Unix-like path
                const parts = path.split('/');
                parts.pop();
                return parts.join('/') || '/';
            } else if (path.includes('\\')) {
                // Windows-like path
                const parts = path.split('\\');
                parts.pop();
                return parts.join('\\') || '\\';
            }
            
            // If no separators, then no directory
            return '';
        },
        basename: function(path) {
            // Getting filename from a path
            if (!path) return '';
            
            // Handling Unix-like paths
            if (path.includes('/')) {
                const parts = path.split('/');
                return parts[parts.length - 1];
            }
            
            // Handling Windows-like paths
            if (path.includes('\\')) {
                const parts = path.split('\\');
                return parts[parts.length - 1];
            }
            
            // If no separators, then the whole path is a filename
            return path;
        }
    };
    
    // Form elements
    const exportForm = document.getElementById('export-readme-form');
    const fullPathInput = document.getElementById('full-path');
    const cancelButton = document.getElementById('cancel-button');
    const exportButton = document.getElementById('export-button');
    const browseDirButton = document.getElementById('browse-dir');
    
    // Check for Browse button
    console.log('Browse button found:', browseDirButton !== null);
    
    // Directory selection elements
    const pathBrowser = document.getElementById('path-browser');
    const directoryList = document.getElementById('directory-list');
    const browserCancelButton = document.getElementById('browser-cancel');
    const browserSelectButton = document.getElementById('browser-select');
    
    // Preset parameters
    let resourceInfo = {};
    let currentDirPath = '';
    let selectedDirItem = null;
    
    // Register event handlers
    document.addEventListener('DOMContentLoaded', initForm);
    exportForm.addEventListener('submit', handleExport);
    cancelButton.addEventListener('click', handleCancel);
    browseDirButton.addEventListener('click', openPathBrowser);
    browserCancelButton.addEventListener('click', closePathBrowser);
    browserSelectButton.addEventListener('click', selectDirectory);
    
    // Form initialization
    function initForm() {
        console.log('Initializing form...');
        
        // Explicit binding of handler to the Browse button
        if (browseDirButton) {
            console.log('Adding browse button event listener');
            browseDirButton.addEventListener('click', function(event) {
                console.log('Browse button clicked!');
                openPathBrowser();
            });
        } else {
            console.error('Browse button not found during initialization');
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received message from extension:', message);
            
            switch (message.command) {
                case 'setResourceInfo':
                    resourceInfo = message.resourceInfo;
                    console.log('Resource info set:', resourceInfo);
                    
                    // Set initial full path to file
                    if (resourceInfo.exportPath && resourceInfo.defaultFilename) {
                        const initialPath = pathModule.join(resourceInfo.exportPath, resourceInfo.defaultFilename);
                        console.log('Setting initial path:', initialPath);
                        fullPathInput.value = initialPath;
                    }
                    break;
                case 'setDirectories':
                    console.log('Directories received:', message.directories);
                    updateDirectoryList(message.directories);
                    break;
            }
        });
        
        // Notify extension that WebView is ready
        console.log('Sending webviewReady message to extension');
        vscode.postMessage({
            command: 'webviewReady'
        });
    }
    
    // Export handling
    function handleExport(event) {
        event.preventDefault();
        
        const fullPath = fullPathInput.value;
        const exportDir = pathModule.dirname(fullPath);
        const filename = pathModule.basename(fullPath);
        
        // Check that the filename is README.md
        const finalFilename = filename === 'README.md' ? filename : 'README.md';
        
        // Collect selected sections
        const selectedSections = [];
        document.querySelectorAll('input[name="sections"]:checked').forEach(checkbox => {
            selectedSections.push(checkbox.value);
        });
        
        const config = {
            docType: 'README.md', // Always use README.md type
            filename: finalFilename,
            exportDir: exportDir,
            sections: selectedSections // Add selected sections
        };
        
        vscode.postMessage({
            command: 'export',
            config: config
        });
    }
    
    // Cancel handling
    function handleCancel() {
        vscode.postMessage({
            command: 'cancel'
        });
    }
    
    // Open directory browser
    function openPathBrowser() {
        console.log('Opening path browser...');
        
        const fullPath = fullPathInput.value;
        currentDirPath = pathModule.dirname(fullPath);
        
        console.log('Current directory path:', currentDirPath);
        
        // Send message to extension
        try {
            console.log('Sending getDirectories message for path:', currentDirPath);
            vscode.postMessage({
                command: 'getDirectories',
                path: currentDirPath
            });
            console.log('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
        }
        
        // Show directory selection dialog
        pathBrowser.classList.remove('hidden');
    }
    
    // Close directory browser
    function closePathBrowser() {
        console.log('Closing path browser');
        pathBrowser.classList.add('hidden');
        selectedDirItem = null;
    }
    
    // Select directory
    function selectDirectory() {
        console.log('Selecting directory...');
        
        if (selectedDirItem) {
            const selectedDir = selectedDirItem.dataset.path;
            console.log('Selected directory:', selectedDir);
            
            const currentFileName = pathModule.basename(fullPathInput.value);
            console.log('Current filename:', currentFileName);
            
            const newPath = pathModule.join(selectedDir, currentFileName);
            console.log('New full path:', newPath);
            
            fullPathInput.value = newPath;
            closePathBrowser();
        } else {
            vscode.postMessage({
                command: 'showMessage',
                message: 'Please select a directory'
            });
        }
    }
    
    // Update directory list
    function updateDirectoryList(directories) {
        directoryList.innerHTML = '';
        selectedDirItem = null;
        
        // Add "up" if not in root directory
        if (directories.parentPath) {
            const upItem = document.createElement('div');
            upItem.className = 'directory-item';
            upItem.dataset.path = directories.parentPath;
            upItem.innerHTML = '<span class="directory-icon">📁</span> ..';
            upItem.addEventListener('click', handleDirectoryItemClick);
            directoryList.appendChild(upItem);
        }
        
        // Add directories
        directories.items.forEach(dir => {
            const dirItem = document.createElement('div');
            dirItem.className = 'directory-item';
            dirItem.dataset.path = dir.path;
            dirItem.innerHTML = `<span class="directory-icon">📁</span> ${dir.name}`;
            dirItem.addEventListener('click', handleDirectoryItemClick);
            
            if (dir.path === currentDirPath) {
                dirItem.classList.add('selected');
                selectedDirItem = dirItem;
            }
            
            directoryList.appendChild(dirItem);
        });
    }
    
    // Handle click on directory item
    function handleDirectoryItemClick(event) {
        const item = event.currentTarget;
        
        // Remove selection from previous element
        if (selectedDirItem) {
            selectedDirItem.classList.remove('selected');
        }
        
        // Select new element
        item.classList.add('selected');
        selectedDirItem = item;
        
        // Handle double click - navigate to directory
        if (event.detail === 2) {
            currentDirPath = item.dataset.path;
            
            vscode.postMessage({
                command: 'getDirectories',
                path: currentDirPath
            });
        }
    }
})(); 