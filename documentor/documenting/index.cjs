// Export all documentation functions from a single file

const { documentPath } = require('./documentPath.cjs');
const { documentDirectory } = require('./documentDirectory.cjs');
const { documentFile } = require('./documentFile.cjs');

module.exports = {
  documentPath,
  documentDirectory,
  documentFile
}; 