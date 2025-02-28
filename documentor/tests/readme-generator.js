/**
 * Test script for README generation
 */

const path = require('path');
const fs = require('fs');
const { generateProjectReadme } = require('../documenting/documentReadme.cjs');

// Mock console for outputChannel
const outputChannel = {
  appendLine: (message) => console.log(message),
  show: () => {}
};

// Set environment variables for testing
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-api-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Path to the project to document
const projectPath = process.argv[2] || path.resolve(__dirname, '../');

// Sections to generate (default: all sections)
const sectionsToGenerate = process.argv[3] ? process.argv[3].split(',') : [];

// Mock OpenAI client for testing
jest.mock('../../openaiClient.cjs', () => {
  return class MockChatGPTClient {
    constructor(apiKey, model, systemText) {
      this.apiKey = apiKey;
      this.model = model;
      this.systemText = systemText;
      console.log(`Mock ChatGPT client created with model: ${model}`);
    }

    async answer(prompt, options = {}) {
      console.log('\n--- LLM PROMPT ---\n');
      console.log(prompt);
      console.log('\n--- END PROMPT ---\n');
      console.log(`Options: ${JSON.stringify(options)}`);
      
      // Return a mock response
      return `This is a mock LLM response for testing purposes.
      
The LLM would normally generate comprehensive content here based on the project index data.
      
- It would analyze the index data
- Generate appropriate content for the section
- Format it according to markdown standards
      
This is just a placeholder.`;
    }
  };
});

async function main() {
  console.log(`Generating README for project: ${projectPath}`);
  console.log(`Sections to generate: ${sectionsToGenerate.length > 0 ? sectionsToGenerate.join(', ') : 'all'}`);
  
  try {
    // Generate the README content
    const readmeContent = await generateProjectReadme(
      projectPath,
      sectionsToGenerate,
      {
        maxIterations: 1
      }
    );
    
    // Write the content to a test file
    const outputPath = path.join(__dirname, 'README-generated.md');
    fs.writeFileSync(outputPath, readmeContent, 'utf8');
    
    console.log(`README generated successfully at: ${outputPath}`);
  } catch (error) {
    console.error('Error generating README:', error);
  }
}

// Bypass jest mocking when running directly
if (require.main === module) {
  const originalJest = global.jest;
  global.jest = undefined;
  main();
  global.jest = originalJest;
} else {
  module.exports = { generateReadmeTest: main };
} 