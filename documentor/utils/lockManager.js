/**
 * File lock management module
 * 
 * Provides functionality for creating, obtaining, and clearing file locks.
 * Uses the proper-lockfile library and adds additional capabilities:
 * - Automatic cleanup of stale locks
 * - Smart detection and removal of hanging locks
 * - Detailed logging for diagnostics
 */

const lockfile = require('proper-lockfile');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Generates a hash for a lock file
 * @param {string} input - Input string for hashing
 * @param {number} length - Length of the resulting hash
 * @returns {string} - Hash as a string
 * @private
 */
function generateHash(input, length = 8) {
  return crypto.createHash('md5').update(input).digest('hex').substring(0, length);
}

/**
 * Normalizes the path for use in a filename
 * @param {string} filePath - Path to file
 * @returns {string} - Normalized path
 * @private
 */
function normalizePath(filePath) {
  return filePath.replace(/[\/\\:]/g, '_');
}

/**
 * Class for managing file locks
 */
class LockManager {
  /**
   * Creates an instance of the lock manager
   * @param {Object} options - Lock manager options
   * @param {string} options.tmpDir - Directory for storing lock files (default is os.tmpdir())
   * @param {string} options.defaultPrefix - Prefix for lock files (default is 'documentor_lock')
   * @param {number} options.defaultStaleTime - Time in milliseconds after which a lock is considered stale
   * @param {Object} options.defaultLockOptions - Options for the proper-lockfile library
   * @param {Object} options.logger - Logger for outputting messages
   */
  constructor(options = {}) {
    this.tmpDir = options.tmpDir || os.tmpdir();
    this.defaultPrefix = options.defaultPrefix || 'documentor_lock';
    this.defaultStaleTime = options.defaultStaleTime || 600000; // 10 minutes by default
    this.defaultLockOptions = options.defaultLockOptions || {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 60000
    };
    
    // Logger initialization
    this.logger = options.logger || console;
  }

  /**
   * Creates a unique path to the lock file for the specified path
   * @param {string} filePath - Path to file or directory
   * @param {string} prefix - Lock file name prefix
   * @returns {string} - Full path to the lock file
   */
  getLockFilePath(filePath, prefix = this.defaultPrefix) {
    const normalizedPath = normalizePath(filePath);
    const hashPath = generateHash(filePath);
    return path.join(this.tmpDir, `${prefix}_${hashPath}_${normalizedPath}.lock`);
  }

  /**
   * Ensures the lock file exists
   * @param {string} lockFilePath - Path to the lock file
   * @private
   */
  async ensureLockFileExists(lockFilePath) {
    try {
      let fileExists = true;
      try {
        await fs.promises.access(lockFilePath, fs.constants.F_OK);
      } catch (e) {
        fileExists = false;
      }
      
      if (!fileExists) {
        await fs.promises.writeFile(lockFilePath, '', { flag: 'w' });
        this.logger.log(`Created new lock file: ${lockFilePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create lock file ${lockFilePath}:`, error);
      throw error; // Propagate the error so the calling code can handle it
    }
  }

  /**
   * Checks if a lock is stale
   * @param {string} lockFilePath - Path to the lock file
   * @param {number} staleTime - Stale time in milliseconds
   * @returns {Promise<{isStale: boolean, age: number}>} - Lock information
   * @private
   */
  async checkStaleLock(lockFilePath, staleTime) {
    try {
      const stats = await fs.promises.stat(lockFilePath);
      const now = Date.now();
      const age = now - Math.floor(stats.mtimeMs);
      return { isStale: age > staleTime, age };
    } catch (error) {
      return { isStale: false, age: 0, error };
    }
  }

  /**
   * Cleans up a stale lock
   * @param {string} lockFilePath - Path to the lock file
   * @param {number} age - Age of the lock in milliseconds
   * @returns {Promise<boolean>} - true if cleanup was successful
   * @private
   */
  async cleanupStaleLockFile(lockFilePath, age) {
    try {
      // Attempt to release the lock
      if (await lockfile.check(lockFilePath)) {
        await lockfile.unlock(lockFilePath).catch(e => {
          this.logger.log(`Couldn't properly unlock stale lock: ${e.message}`);
        });
      }
      
      // If we couldn't release the lock, delete the file directly
      if (await lockfile.check(lockFilePath)) {
        await fs.promises.unlink(lockFilePath);
        this.logger.log(`Removed stale lock file directly (age: ${Math.round(age/60000)}min)`);
      }
      
      // Create a new lock file
      await this.ensureLockFileExists(lockFilePath);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cleanup stale lock:`, error);
      return false;
    }
  }

  /**
   * Locks a file and returns a function to release the lock
   * @param {string} filePath - Path to the file
   * @param {string} prefix - Prefix for the lock file
   * @param {Object} options - Additional lock parameters
   * @returns {Promise<Function>} - Function to release the lock
   */
  async acquireLock(filePath, prefix, options = {}) {
    const lockFilePath = this.getLockFilePath(filePath, prefix);
    console.log(`Acquiring lock: ${filePath} -> ${lockFilePath}`);
    
    await this.ensureLockFileExists(lockFilePath);

    // Lock parameters
    const staleTime = options.stale || this.defaultStaleTime;
    const retries = options.retries || this.defaultLockOptions.retries;
    
    const lockOptions = {
      retries: {
        retries: retries,
        factor: this.defaultLockOptions.factor,
        minTimeout: this.defaultLockOptions.minTimeout,
        maxTimeout: this.defaultLockOptions.maxTimeout,
      },
      stale: staleTime
    };

    try {
      // Check if the lock is stale before trying to acquire a new one
      if (await lockfile.check(lockFilePath)) {
        const { isStale, age } = await this.checkStaleLock(lockFilePath, staleTime);
        
        if (isStale) {
          console.log(`Cleaning stale lock: ${lockFilePath} (age: ${Math.round(age/60000)}min)`);
          await this.cleanupStaleLockFile(lockFilePath, age);
        }
      }
      
      // Try to acquire a lock with configured retry parameters
      const release = await lockfile.lock(lockFilePath, lockOptions);
      console.log(`Lock acquired: ${lockFilePath}`);
      
      // Wrap the release function to add logging
      return () => {
        console.log(`Releasing lock: ${lockFilePath}`);
        return release();
      };
    } catch (error) {
      if (error.code === 'ELOCKED') {
        console.log(`Lock failed: ${lockFilePath} (already locked)`);
        this.logger.log(`Could not acquire lock for ${filePath}, resource is locked`);
      } else {
        console.log(`Lock error: ${lockFilePath} (${error.message})`);
        this.logger.error(`Error acquiring lock for ${filePath}:`, error);
      }
      throw error;
    }
  }

  /**
   * Cleans up all stale lock files
   * @param {number} maxAgeMs - Maximum age of the lock file in milliseconds
   * @param {string[]} prefixes - Array of file prefixes to clean up
   * @returns {Promise<Object>} - Information about cleanup results
   */
  async cleanupStaleLocks(maxAgeMs = 3600000, prefixes = [this.defaultPrefix]) {
    try {
      const files = await fs.promises.readdir(this.tmpDir);
      const now = Date.now();
      
      // Filter lock files
      const lockFiles = files.filter(file => {
        if (!file.endsWith('.lock')) return false;
        return prefixes.some(prefix => file.startsWith(prefix));
      });
      
      this.logger.log(`Found ${lockFiles.length} lock files matching prefixes: ${prefixes.join(', ')}`);
      
      let removedCount = 0;
      let failedCount = 0;
      
      for (const file of lockFiles) {
        const lockFilePath = path.join(this.tmpDir, file);
        try {
          const stats = await fs.promises.stat(lockFilePath);
          const age = now - Math.floor(stats.mtimeMs);
          
          // If the file is older than maxAgeMs, delete it
          if (age > maxAgeMs) {
            const success = await this.cleanupStaleLockFile(lockFilePath, age);
            if (success) {
              removedCount++;
            } else {
              failedCount++;
            }
          }
        } catch (statError) {
          this.logger.log(`Could not stat lock file ${file}:`, statError.message);
        }
      }
      
      this.logger.log(`Lock cleanup summary: removed ${removedCount} files, failed to remove ${failedCount} files`);
      return { removed: removedCount, failed: failedCount, total: lockFiles.length };
    } catch (error) {
      this.logger.error('Error during stale lock cleanup:', error);
      throw error;
    }
  }
  
  /**
   * Cleans up locks for a specific file
   * @param {string} filePath - Path to the file
   * @param {string[]} prefixes - Lock prefixes to clean up
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupFileLocks(filePath, prefixes = []) {
    try {
      const allPrefixes = prefixes.length > 0 ? prefixes : [this.defaultPrefix];
      let cleaned = 0;
      let failed = 0;
      
      for (const prefix of allPrefixes) {
        const lockFilePath = this.getLockFilePath(filePath, prefix);
        
        try {
          if (await lockfile.check(lockFilePath)) {
            // Check if the lock is stale
            const { isStale, age } = await this.checkStaleLock(
              lockFilePath, 
              this.defaultStaleTime
            );
            
            if (isStale) {
              const success = await this.cleanupStaleLockFile(lockFilePath, age);
              if (success) {
                cleaned++;
              } else {
                failed++;
              }
            }
          }
        } catch (error) {
          this.logger.log(`Error checking lock for ${prefix}: ${error.message}`);
          failed++;
        }
      }
      
      return { cleaned, failed, prefixes: allPrefixes };
    } catch (error) {
      this.logger.error(`Error cleaning file locks: ${error.message}`);
      throw error;
    }
  }
}

// Create and export a lock manager instance with default settings
const lockManager = new LockManager();

module.exports = {
  LockManager,   // Export the class to allow creating new instances
  lockManager    // Export a ready-to-use instance for default usage
}; 