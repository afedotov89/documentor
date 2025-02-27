const { minimatch } = require('minimatch');

const defaultIgnorePatterns = [
    // Системные директории и файлы
    'node_modules/**',
    '.git/**',
    
    // Временные файлы и кэш
    '**/*.tmp',
    '**/*.temp',
    '**/__pycache__/**',
    '.cache/**',
    
    // Бинарные и сгенерированные файлы
    'dist/**',
    'build/**',
    'out/**',
    '**/*.min.*',
    '**/*.bundle.*',
    '**/*.map',
    
    // Медиа и бинарные файлы
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
    
    // Логи
    '**/*.log',
    'logs/**',
    
    // Скрытые файлы и директории
    '**/.*',
    '**/.*/**'
];

function isPathIgnored(path, customPatterns = []) {
    const patterns = [...defaultIgnorePatterns, ...customPatterns];
    return patterns.some(pattern => 
        minimatch(path, pattern, { dot: true, matchBase: true })
    );
}

module.exports = {
    defaultIgnorePatterns,
    isPathIgnored
}; 