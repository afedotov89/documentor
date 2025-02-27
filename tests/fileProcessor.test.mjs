import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fileProcessor = require('../documentor/indexing/fileIndexer.cjs');
const documentGenerator = require('../documentor/documentGenerator.cjs');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { indexManager } = require('../documentor/indexing/indexManager.cjs');

// Add getVscode definition for testing outside the VSCode environment
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

describe('fileProcessor tests', function() {
  beforeEach(() => {
    indexManager.clearProjectIndex(__dirname);
  });

  // Increase timeout as the LLM request can take a significant amount of time
  this.timeout(30000); 

  it('should process a Python file and insert a docstring at the top', async function () {
    // Skip test if API key is not set or equals dummy-api-key
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-api-key') {
      console.warn("Skipping test: environment variable OPENAI_API_KEY is not set or contains dummy-api-key");
      this.skip();
    }

    // Create temporary Python file with basic content
    const tempFilePath = path.join(__dirname, 'temp_test.py');
    const initialContent = 'def foo():\n    pass\n';
    fs.writeFileSync(tempFilePath, initialContent, 'utf8');

    // Call documentResource function instead of indexFile
    const outputChannel = getVscode().window.createOutputChannel('Documentor');
    // Prepare resource with fsPath for documentResource
    const resource = { fsPath: tempFilePath };
    await documentGenerator.documentResource(resource);

    // Read updated file content after docstring insertion
    const updatedContent = fs.readFileSync(tempFilePath, 'utf8');

    // Add output of final file content to console for debugging
    console.log("Final file content:\n", updatedContent);

    // Get information from the index
    const response = await documentGenerator.getDocumentation(resource);
    console.log("Final index content:\n", response);

    // Check that the file starts with a docstring (triple quotes)
    assert.ok(updatedContent.startsWith('"""'), "Docstring not added at the beginning of file");

    // Check that the original file content is present after the docstring
    assert.ok(updatedContent.includes("def foo()"), "Original file content is missing after docstring");

    // Additionally check that the LLM response is not empty
    assert.ok(response && response.description.length > 0, "LLM response is empty");

    // Delete temporary file after test execution
    fs.unlinkSync(tempFilePath);
  });
}); 