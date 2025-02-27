/**
 * Project documentation generation utilities
 */

const pathModule = require('path');

/**
 * Generates standard documentation for the project
 * @param {object} resource - Resource (path to project)
 * @param {object} fileInfo - Project information
 * @param {array} indexedFiles - Array with information about indexed files
 * @param {array} sections - Array with selected sections to include in README
 * @returns {string} Generated documentation
 */
async function generateStandardProjectDocumentation(resource, fileInfo, indexedFiles, sections = []) {
  const workspaceName = pathModule.basename(resource.fsPath);
  
  // Section titles mapping for readable section names
  const sectionTitles = {
    'project-title': 'Project Overview',
    'overview': 'Introduction',
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
  };
  
  // If sections are not specified, include all sections from sectionTitles by default
  const includeSections = sections.length > 0 ? sections : Object.keys(sectionTitles);
  
  // Title is always included
  let content = [
    `# Project Documentation: ${workspaceName}`,
    `\n*Generated on: ${new Date().toLocaleString()}*`
  ];
  
  // Add project title and description if selected
  if (includeSections.includes('project-title')) {
    content = [
      `# ${workspaceName}`,
      `\n*Generated on: ${new Date().toLocaleString()}*`,
      `\n${fileInfo.description || 'A comprehensive documentation for the project.'}`
    ];
  }
  
  // Add overview if selected
  if (includeSections.includes('overview')) {
    content.push(`\n## ${sectionTitles['overview']}`, `\n${fileInfo.docstring || 'Project documentation'}`);
  }
  
  // Add features section if selected
  if (includeSections.includes('features')) {
    content.push(
      `\n## ${sectionTitles['features']}`,
      `\n- Feature 1: Description`,
      `\n- Feature 2: Description`,
      `\n- Feature 3: Description`
    );
  }
  
  // Add requirements section if selected
  if (includeSections.includes('requirements')) {
    content.push(
      `\n## ${sectionTitles['requirements']}`,
      `\n- Requirement 1: Version X.Y.Z or higher`,
      `\n- Requirement 2: Version X.Y.Z or higher`
    );
  }
  
  // Add installation instructions if selected
  if (includeSections.includes('installation')) {
    content.push(
      `\n## ${sectionTitles['installation']}`,
      `\nFollow these steps to install and set up the project:`,
      `\n1. Install dependencies:`,
      `\n   \`npm install\``,
      `\n2. (Optional) Compile the project if necessary`,
      `\n3. Run the project:`,
      `\n   \`npm start\``
    );
  }
  
  // Add usage instructions if selected
  if (includeSections.includes('usage-examples')) {
    content.push(
      `\n## ${sectionTitles['usage-examples']}`,
      `\n1. **Basic Usage**:`,
      `\n   - Start the application`,
      `\n   - Follow the on-screen instructions`,
      `\n2. **Advanced Features**:`,
      `\n   - Refer to the documentation for advanced features`
    );
  }
  
  // Add configuration section if selected
  if (includeSections.includes('configuration')) {
    content.push(
      `\n## ${sectionTitles['configuration']}`,
      `\n### Configuration Options`,
      `\n- Option 1: Description`,
      `\n- Option 2: Description`
    );
  }
  
  // Add structure section if selected
  if (includeSections.includes('structure')) {
    content.push(
      `\n## ${sectionTitles['structure']}`,
      `\n\`\`\``,
      `\n└── project/`,
      `\n    ├── src/`,
      `\n    │   ├── main.js`,
      `\n    │   └── utils/`,
      `\n    ├── docs/`,
      `\n    ├── tests/`,
      `\n    └── README.md`,
      `\n\`\`\``
    );
  }
  
  // Add contributing section if selected
  if (includeSections.includes('contributing')) {
    content.push(
      `\n## ${sectionTitles['contributing']}`,
      `\n1. Fork the repository`,
      `\n2. Create a feature branch`,
      `\n3. Submit a pull request`
    );
  }
  
  // Add license section if selected
  if (includeSections.includes('license')) {
    content.push(
      `\n## ${sectionTitles['license']}`,
      `\nThis project is licensed under the MIT License - see the LICENSE file for details.`
    );
  }
  
  // Add authors section if selected
  if (includeSections.includes('authors')) {
    content.push(
      `\n## ${sectionTitles['authors']}`,
      `\n- Developer Name - [email@example.com](mailto:email@example.com)`
    );
  }
  
  // Add API documentation section if selected
  if (includeSections.includes('api')) {
    content.push(
      `\n## ${sectionTitles['api']}`,
      `\n### API Endpoints`,
      `\n- \`GET /api/resource\`: Description`,
      `\n- \`POST /api/resource\`: Description`,
      `\n- \`PUT /api/resource/:id\`: Description`,
      `\n- \`DELETE /api/resource/:id\`: Description`
    );
  }
  
  // Add testing section if selected
  if (includeSections.includes('testing')) {
    content.push(
      `\n## ${sectionTitles['testing']}`,
      `\nRun the tests with:`,
      `\n\`\`\``,
      `\nnpm test`,
      `\n\`\`\``
    );
  }
  
  // Add deployment section if selected
  if (includeSections.includes('deployment')) {
    content.push(
      `\n## ${sectionTitles['deployment']}`,
      `\n1. Build the project: \`npm run build\``,
      `\n2. Deploy to production: \`npm run deploy\``
    );
  }
  
  return content.join('\n');
}

module.exports = {
  generateStandardProjectDocumentation
}; 