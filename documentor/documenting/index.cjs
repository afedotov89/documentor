// Export all documentation functions from a single file

const { documentPath } = require('./documentPath.cjs');
const { documentDirectory } = require('./documentDirectory.cjs');
const { documentFile } = require('./documentFile.cjs');
const { generateStandardProjectDocumentation } = require('./documentProject.cjs');
const { 
  generateProjectReadme,
  parseReadmeIntoSections,
  collectProjectIndexData
} = require('./documentReadme.cjs');

module.exports = {
  documentPath,
  documentDirectory,
  documentFile,
  generateStandardProjectDocumentation,
  generateProjectReadme,
  parseReadmeIntoSections,
  collectProjectIndexData
}; 