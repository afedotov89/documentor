import path from 'path';
import fs from 'fs';
import os from 'os';
import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the module to test - adjust path to point to config directory
import { 
    findProjectRoot, 
    readGitignorePatterns, 
    isPathIgnored,
    defaultIgnorePatterns
} from '../config/ignorePatterns.cjs';

/**
 * Creates a temporary directory structure for testing
 * @returns {Object} Object containing paths and cleanup function
 */
function createTempProjectStructure() {
    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'documentor-tests-'));
    
    // Create mock project structure
    const projectRoot = path.join(tempDir, 'mock-project');
    const srcDir = path.join(projectRoot, 'src');
    const nodeModulesDir = path.join(projectRoot, 'node_modules');
    
    fs.mkdirSync(projectRoot);
    fs.mkdirSync(srcDir);
    fs.mkdirSync(nodeModulesDir);
    
    // Create marker files
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name": "mock-project"}');
    fs.writeFileSync(path.join(projectRoot, '.gitignore'), 
        '# Gitignore file\n' +
        'node_modules/\n' +
        'build/\n' +
        '*.log\n' +
        '.env\n'
    );
    
    // Create some test files
    fs.writeFileSync(path.join(srcDir, 'index.js'), '// Main file');
    fs.writeFileSync(path.join(srcDir, 'test.log'), 'Test log');
    fs.writeFileSync(path.join(projectRoot, '.env'), 'SECRET=test');
    
    // Return object with relevant paths and cleanup function
    return {
        tempDir,
        projectRoot,
        srcDir,
        nodeModulesDir,
        cleanup: () => {
            try {
                // Remove the temp directory recursively
                const deleteFolderRecursive = (folderPath) => {
                    if (fs.existsSync(folderPath)) {
                        fs.readdirSync(folderPath).forEach((file) => {
                            const curPath = path.join(folderPath, file);
                            if (fs.lstatSync(curPath).isDirectory()) {
                                // Recursive call
                                deleteFolderRecursive(curPath);
                            } else {
                                // Delete file
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(folderPath);
                    }
                };
                
                deleteFolderRecursive(tempDir);
            } catch (error) {
                console.error('Failed to clean up temp directory:', error);
            }
        }
    };
}

describe('ignorePatterns', function() {
    describe('findProjectRoot', function() {
        let tempProjectData;
        
        beforeEach(function() {
            tempProjectData = createTempProjectStructure();
        });
        
        afterEach(function() {
            if (tempProjectData) {
                tempProjectData.cleanup();
            }
        });
        
        it('should find project root from root directory', function() {
            const { projectRoot } = tempProjectData;
            const foundRoot = findProjectRoot(projectRoot);
            expect(foundRoot).to.equal(projectRoot);
        });
        
        it('should find project root from subdirectory', function() {
            const { projectRoot, srcDir } = tempProjectData;
            const foundRoot = findProjectRoot(srcDir);
            expect(foundRoot).to.equal(projectRoot);
        });
        
        it('should fallback to provided directory when no markers found', function() {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-markers-'));
            try {
                const foundRoot = findProjectRoot(tempDir);
                expect(foundRoot).to.equal(tempDir);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });
    
    describe('readGitignorePatterns', function() {
        let tempProjectData;
        
        beforeEach(function() {
            tempProjectData = createTempProjectStructure();
        });
        
        afterEach(function() {
            if (tempProjectData) {
                tempProjectData.cleanup();
            }
        });
        
        it('should read patterns from .gitignore file', function() {
            const { projectRoot } = tempProjectData;
            const patterns = readGitignorePatterns(projectRoot);
            
            expect(patterns).to.be.an('array');
            expect(patterns).to.include('node_modules/');
            expect(patterns).to.include('*.log');
            expect(patterns).to.include('.env');
        });
        
        it('should return empty array when .gitignore not found', function() {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-gitignore-'));
            try {
                const patterns = readGitignorePatterns(tempDir);
                expect(patterns).to.be.an('array');
                expect(patterns).to.be.empty;
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });
    
    describe('isPathIgnored', function() {
        let tempProjectData;
        
        beforeEach(function() {
            tempProjectData = createTempProjectStructure();
        });
        
        afterEach(function() {
            if (tempProjectData) {
                tempProjectData.cleanup();
            }
        });
        
        it('should correctly identify ignored paths based on default patterns', function() {
            const { projectRoot } = tempProjectData;
            
            expect(isPathIgnored('node_modules/package/index.js', [], projectRoot)).to.be.true;
            expect(isPathIgnored('.git/HEAD', [], projectRoot)).to.be.true;
            expect(isPathIgnored('dist/bundle.js', [], projectRoot)).to.be.true;
            expect(isPathIgnored('src/main.js', [], projectRoot)).to.be.false;
        });
        
        it('should correctly identify ignored paths based on .gitignore patterns', function() {
            const { projectRoot } = tempProjectData;
            
            expect(isPathIgnored('src/test.log', [], projectRoot)).to.be.true;
            expect(isPathIgnored('.env', [], projectRoot)).to.be.true;
        });
        
        it('should correctly identify ignored paths based on custom patterns', function() {
            const { projectRoot } = tempProjectData;
            
            expect(isPathIgnored('src/index.js', ['src/**'], projectRoot)).to.be.true;
            expect(isPathIgnored('src/index.js', [], projectRoot)).to.be.false;
            expect(isPathIgnored('README.md', ['*.md'], projectRoot)).to.be.true;
        });
    });
    
    describe('defaultIgnorePatterns', function() {
        it('should include common patterns for node, build artifacts and binary files', function() {
            expect(defaultIgnorePatterns).to.be.an('array');
            expect(defaultIgnorePatterns).to.include('node_modules/**');
            expect(defaultIgnorePatterns).to.include('.git/**');
            expect(defaultIgnorePatterns).to.include('**/*.log');
            expect(defaultIgnorePatterns).to.include('**/*.jpg');
        });
    });
}); 