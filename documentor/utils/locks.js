/**
 * Utilities for working with file locks
 * 
 * Provides a set of helper functions for working with the locking system.
 */

const { lockManager, LockManager } = require('./lockManager');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Returns a list of all lock files
 * @param {string} prefix - Search for files with this prefix (by default all documentor_ files)
 * @returns {Promise<Array>} - Array of lock file paths
 */
async function getFileLocks(prefix = 'documentor_') {
  try {
    const tmpDir = os.tmpdir();
    const files = await fs.readdir(tmpDir);
    
    // Filter lock files
    const lockFiles = files.filter(file => 
      file.startsWith(prefix) && file.endsWith('.lock')
    );
    
    return lockFiles.map(file => path.join(tmpDir, file));
  } catch (error) {
    console.error('Error getting lock files:', error);
    return [];
  }
}

/**
 * Gets lock information for the specified file
 * @param {string} filePath - Path to the file
 * @param {string[]} prefixes - Lock prefixes to search for
 * @returns {Promise<Object>} - Lock information for the file
 */
async function getFileLocksInfo(filePath, prefixes = ['documentor_']) {
  const result = {
    filePath,
    locks: [],
    count: 0
  };
  
  try {
    for (const prefix of prefixes) {
      const lockPath = lockManager.getLockFilePath(filePath, prefix);
      let isLocked = false;
      let age = null;
      
      try {
        isLocked = await require('proper-lockfile').check(lockPath);
        
        if (isLocked) {
          const stats = await fs.stat(lockPath);
          age = Date.now() - Math.floor(stats.mtimeMs);
        }
      } catch (e) {
        // Lock file may not exist
      }
      
      if (isLocked) {
        result.locks.push({
          prefix,
          path: lockPath,
          age,
          ageMinutes: age ? Math.round(age / 60000) : null
        });
        result.count++;
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Error getting locks info for ${filePath}:`, error);
    return result;
  }
}

/**
 * Creates a temporary lock manager instance for testing
 * @param {Object} options - Options for the lock manager
 * @returns {LockManager} - New lock manager instance
 */
function createTestLockManager(options = {}) {
  return new LockManager({
    tmpDir: options.tmpDir || path.join(os.tmpdir(), 'test_locks'),
    defaultPrefix: options.defaultPrefix || 'test_lock',
    defaultStaleTime: options.defaultStaleTime || 1000, // 1 second for tests
    logger: options.logger || {
      log: () => {},
      error: () => {}
    }
  });
}

module.exports = {
  getFileLocks,
  getFileLocksInfo,
  createTestLockManager
}; 