import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const directoryProcessor = require('../documentor/indexing/directoryIndexer.cjs');
const documentGenerator = require('../documentor/documentGenerator.cjs');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { indexManager } = require('../documentor/indexing/indexManager.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock for VSCode API
function getVscode() {
  return {
    window: {
      createOutputChannel: function (channelName) {
        // Return minimally required interface for outputChannel
        return {
          append: (message) => {
            console.log(`[OutputChannel ${channelName}]: ${message}`);
          },
          appendLine: (message) => {
            console.log(`[OutputChannel ${channelName}]: ${message}`);
          },
          show: () => {
            console.log(`[OutputChannel ${channelName}]: show`);
          },
        };
      },
    },
  };
}

describe('Directory Processing Integration Tests', function () {
  this.timeout(30000);

  beforeEach(() => {
    indexManager.clearProjectIndex(__dirname);
  });

  it('should process directory with Python file and insert docstrings', async function () {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-api-key') {
      console.warn("Skipping test: OPENAI_API_KEY is not set");
      this.skip();
    }

    const tempDir = path.join(__dirname, 'temp_test_dir');
    fs.mkdirSync(tempDir, { recursive: true });

    const testFilePath = path.join(tempDir, 'test_file.py');
    const initialContent = 'def bar():\n    print("hello")\n';
    fs.writeFileSync(testFilePath, initialContent, 'utf8');

    const outputChannel = getVscode().window.createOutputChannel('Documentor');
    // Prepare resource with fsPath for documentResource
    const resource = { fsPath: tempDir };
    await documentGenerator.documentResource(resource);

    const updatedContent = fs.readFileSync(testFilePath, 'utf8');
    
    console.log("Processed file:\n", updatedContent);
    // Get information from the index
    const response = await documentGenerator.getDocumentation({ fsPath: tempDir });
    console.log("Processing response:\n", response);

    assert.ok(updatedContent.startsWith('"""'), "Docstring is missing");
    assert.ok(updatedContent.includes("def bar()"), "Source code has been modified");
    assert.ok(response.members.length == 1, "Wrong number of members");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
}); 