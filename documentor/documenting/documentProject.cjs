/**
 * Project documentation generation utilities
 */

const pathModule = require('path');
const fs = require('fs');

// Импортируем функцию getOutputChannel из documentGenerator
let getOutputChannel;
try {
  const documentGenerator = require('../documentGenerator.cjs');
  getOutputChannel = documentGenerator.getOutputChannel;
} catch (error) {
  console.error('Failed to import documentGenerator:', error);
  // Fallback for testing
  getOutputChannel = () => console;
}

// Attempt to connect vscode module; if not available (during testing), use a stub
let vscode;
try {
  vscode = require('vscode');
} catch (error) {
  vscode = {
    workspace: {
      getConfiguration: () => ({
        get: (key) => {
          if (key === 'OpenAI API Key') return process.env.OPENAI_API_KEY;
          if (key === 'model') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
          return undefined;
        }
      })
    },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
      }),
      showErrorMessage: (msg) => console.error(msg)
    }
  };
}

// Import functions from documentReadme.cjs
let readmeFunctions;
try {
  readmeFunctions = require('./documentReadme.cjs');
} catch (error) {
  console.error('Failed to import documentReadme.cjs:', error);
  // Fallback stub implementation
  readmeFunctions = {
    parseReadmeIntoSections: () => ({}),
    collectProjectIndexData: () => ({ root: null, files: {} }),
    createLlmPrompt: () => '',
    deepenSectionContent: async (sectionKey, sectionTitle, content) => content,
    assembleReadme: () => '',
    generateProjectReadme: async () => ''
  };
}

/**
 * Generates standard documentation for the project
 * @param {object} resource - Resource (path to project)
 * @param {object} fileInfo - Project information
 * @param {array} sections - Array with selected sections to include in README
 * @returns {string} Generated documentation
 */
async function generateStandardProjectDocumentation(resource, fileInfo, sections = []) {
  // Получаем общий output channel
  const outputChannel = getOutputChannel();
  
  // Показываем пользователю output channel
  if (outputChannel && typeof outputChannel.show === 'function') {
    outputChannel.show();
  }
  
  // Ensure outputChannel has appendLine method
  const logger = {
    appendLine: (message) => {
      if (outputChannel && typeof outputChannel.appendLine === 'function') {
        outputChannel.appendLine(message);
      } else {
        console.log(message);
      }
    }
  };

  const projectPath = resource.fsPath;
  const workspaceName = pathModule.basename(projectPath);
  
  logger.appendLine(`Starting README generation for ${workspaceName}...`);
  logger.appendLine(`Sections to generate: ${sections.join(', ') || 'all'}`);
  
  // Настройки для generateProjectReadme
  const options = {
    sectionTitles: {
      'project-title': 'Project Description',
      'overview': 'Overview',
      'features': 'Key Features',
      'requirements': 'System Requirements',
      'installation': 'Installation Guide',
      'usage-examples': 'Usage Guide',
      'configuration': 'Configuration',
      'api': 'API Reference',
      'testing': 'Testing Instructions',
      'deployment': 'Deployment Guide',
      'structure': 'Project Structure',
      'license': 'License Information',
      'contributing': 'Contribution Guidelines',
      'authors': 'Team & Contributors'
    },
    sectionOrder: [
      'project-title',
      'overview',
      'features',
      'requirements',
      'installation',
      'usage-examples',
      'configuration',
      'api',
      'testing',
      'deployment',
      'structure',
      'contributing',
      'license',
      'authors'
    ],
    maxIterations: 3
  };
  
  // Используем функцию из documentReadme.cjs
  return readmeFunctions.generateProjectReadme(projectPath, sections, options);
}

module.exports = {
  generateStandardProjectDocumentation
}; 