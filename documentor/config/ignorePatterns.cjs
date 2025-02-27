const { minimatch } = require('minimatch');

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

function isPathIgnored(path, customPatterns = []) {
    const patterns = [...defaultIgnorePatterns, ...customPatterns];
    return patterns.some(pattern => 
        minimatch(path, pattern, { dot: true, matchBase: true })
        || minimatch(path, '**/' + pattern, { dot: true, matchBase: true })
    );
}

module.exports = {
    defaultIgnorePatterns,
    isPathIgnored
}; 