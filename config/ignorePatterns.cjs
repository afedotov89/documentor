const { minimatch } = require('minimatch');
const fs = require('fs');
const path = require('path');

/**
 * Finds the project root directory by looking for marker files
 * @param {string} startDir - Directory to start the search from
 * @param {string[]} markerFiles - Files or directories that indicate project root
 * @returns {string} Path to the project root directory
 */
function findProjectRoot(startDir = process.cwd(), markerFiles = ['.git', 'package.json', '.gitignore']) {
    // Convert to absolute path if not already
    let currentDir = path.isAbsolute(startDir) ? startDir : path.resolve(startDir);
    
    // Get the root directory of the filesystem
    const { root } = path.parse(currentDir);
    
    // Traverse up until we find a marker file or reach the filesystem root
    while (currentDir !== root) {
        // Check if any marker file exists in the current directory
        const found = markerFiles.some(marker => 
            fs.existsSync(path.join(currentDir, marker))
        );
        
        if (found) {
            return currentDir;
        }
        
        // Move up one directory
        const parentDir = path.dirname(currentDir);
        
        // Break if we're not moving up anymore (reached root)
        if (parentDir === currentDir) {
            break;
        }
        
        currentDir = parentDir;
    }
    
    // If no marker file found, default to the starting directory
    console.warn('Could not find project root directory. Using starting directory as fallback.');
    return startDir;
}

/**
 * Reads and parses .gitignore file from the project root
 * @param {string} projectRoot - Path to the project root directory
 * @returns {string[]} Array of patterns from .gitignore
 */
function readGitignorePatterns(projectRoot) {
    // Find project root if not provided
    const rootDir = projectRoot || findProjectRoot();
    
    const gitignorePath = path.join(rootDir, '.gitignore');
    
    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
        return [];
    }
    
    try {
        // Read and parse .gitignore file
        const content = fs.readFileSync(gitignorePath, 'utf8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
            .map(pattern => {
                // Convert .gitignore patterns to minimatch patterns if needed
                if (pattern.startsWith('!')) {
                    // Negated patterns not supported in this simple implementation
                    return null;
                }
                return pattern;
            })
            .filter(Boolean); // Filter out null values
    } catch (error) {
        console.warn(`Error reading .gitignore file: ${error.message}`);
        return [];
    }
}

const defaultIgnorePatterns = [
    // System directories and files
    'node_modules/**',
    '.git/**',
    
    // Temporary files and cache
    '**/*.tmp',
    '**/*.temp',
    '**/__pycache__',
    '**/__pycache__/**',
    '.cache',
    '.cache/**',
    
    // Binary and generated files
    'dist/**',
    'build',
    'build/**',
    'out/**',
    '**/*.min.*',
    '**/*.bundle.*',
    '**/*.map',
    
    // Python egg-info directories
    '**/*.egg-info/**',
    '*.egg-info',

    
    // Media and binary files
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.png',
    '**/*.gif',
    '**/*.ico',
    '**/*.svg',
    '**/*.woff',
    '**/*.woff2',
    '**/*.ttf',
    '**/*.eot',
    '**/*.pdf',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.rar',
    
    // Logs
    '**/*.log',
    'logs/**',
    
    // Hidden files and directories
    '.*',
    '.*/**',
    '**/.*',
    '**/.*/**'
];

/**
 * Checks if a path should be ignored based on the ignore patterns
 * @param {string} path - Path to check
 * @param {string[]} customPatterns - Additional custom patterns to check
 * @param {string} projectRoot - Path to the project root directory
 * @returns {boolean} - Whether the path should be ignored
 */
function isPathIgnored(path, customPatterns = [], projectRoot) {
    // Find project root if not provided
    const rootDir = projectRoot || findProjectRoot();
    
    // Get patterns from .gitignore
    const gitignorePatterns = readGitignorePatterns(rootDir);
    
    // Combine all patterns
    const patterns = [...defaultIgnorePatterns, ...customPatterns, ...gitignorePatterns];
    
    return patterns.some(pattern => 
        minimatch(path, pattern, { dot: true, matchBase: true })
        || minimatch(path, '**/' + pattern, { dot: true, matchBase: true })
    );
}

module.exports = {
    defaultIgnorePatterns,
    isPathIgnored,
    readGitignorePatterns, // Export for testing or explicit usage
    findProjectRoot // Export the new utility function
};

// Add named exports for ES modules compatibility
module.exports.defaultIgnorePatterns = defaultIgnorePatterns;
module.exports.isPathIgnored = isPathIgnored;
module.exports.readGitignorePatterns = readGitignorePatterns;
module.exports.findProjectRoot = findProjectRoot; 