/**
 * Command to force cleanup of documentor lock files
 */
const vscode = require('vscode');
const { lockManager } = require('../utils/lockManager');

/**
 * Registers a command for cleaning up stale locks
 * @param {vscode.ExtensionContext} context - Extension context
 * @returns {vscode.Disposable} - Command disposable object
 */
function registerCleanupLocksCommand(context) {
  return vscode.commands.registerCommand('documentor.cleanupLocks', async () => {
    const outputChannel = vscode.window.createOutputChannel('Documentor Cleanup');
    outputChannel.show();
    
    outputChannel.appendLine('Starting cleanup of stale lock files...');
    
    try {
      // Force cleanup with shorter age (10 minutes)
      await lockManager.cleanupStaleLocks(600000);
      outputChannel.appendLine('Lock cleanup completed successfully.');
      vscode.window.showInformationMessage('Documentor lock cleanup completed successfully.');
    } catch (error) {
      outputChannel.appendLine(`Error during lock cleanup: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to cleanup locks: ${error.message}`);
    }
  });
}

module.exports = { registerCleanupLocksCommand }; 