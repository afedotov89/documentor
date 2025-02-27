const pathModule = require('path');

/**
 * Generates a prompt for creating a Python module docstring.
 * @param {string} content - Full content of the Python file.
 * @param {string} currentPath - File path of the module.
 * @returns {string} - The generated prompt.
 */
function generatePythonDocstringPrompt(content, currentPath) {
  const moduleName = pathModule.basename(currentPath, '.py');
  return `Generate a docstring that provides a general description for the Python module.
Module (unnamed in the docstring): \`${moduleName}\`
Based solely on the following file content:
${content}

Ensure that the docstring meets the following criteria:
- Provides a concise, general overview of the module without listing its members.
- Does not include usage examples.
- Does not refer explicitly to the Python language.
- Does not mention the module name.
- Each line is no longer than 100 characters.
- Remains professional and focused solely on the provided content.

Output only the text without any code formatting.`;
}

/**
 * Updates a Python file by inserting the provided docstring.
 * Handles files starting with a shebang appropriately.
 * @param {string} currentPath - File path of the Python module.
 * @param {string} content - Original file content.
 * @param {string} response - Generated docstring to insert.
 * @param {object} fsPromises - The fs.promises API.
 * @param {object} outputChannel - VSCode output channel for logging errors/messages.
 */
async function updatePythonFileWithDocstring(currentPath, content, response, fsPromises, outputChannel) {
  try {
    let newContent;
    if (content.startsWith('#!')) {
      const newlineIndex = content.indexOf('\n');
      if (newlineIndex !== -1) {
        // Retain the shebang line and insert the docstring after it.
        const shebang = content.slice(0, newlineIndex);
        const restContent = content.slice(newlineIndex + 1);
        newContent = `${shebang}\n\n"""\n${response}\n"""\n\n${restContent}`;
      } else {
        // File contains only a shebang.
        newContent = `${content}\n\n"""\n${response}\n"""\n`;
      }
    } else {
      // Prepend the docstring to the file content.
      newContent = `"""\n${response}\n"""\n\n${content}`;
    }
    await fsPromises.writeFile(currentPath, newContent, 'utf8');
  } catch (error) {
    if (outputChannel) {
      outputChannel.appendLine(`Error updating Python file ${currentPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extracts an existing docstring from a Python file if present.
 * @param {string} content - Full content of the Python file.
 * @returns {string|null} - The extracted docstring or null if not found.
 */
function getPythonDocstring(content) {
  let trimmed = content.trim();
  // Remove shebang if present
  if (trimmed.startsWith('#!')) {
    const newlineIndex = trimmed.indexOf('\n');
    trimmed = trimmed.slice(newlineIndex + 1).trim();
  }
  // Check for triple double quotes
  if (trimmed.startsWith('"""')) {
    const closingIndex = trimmed.indexOf('"""', 3);
    if (closingIndex !== -1) {
      return trimmed.slice(3, closingIndex).trim();
    }
  }
  // Check for triple single quotes
  if (trimmed.startsWith("'''")) {
    const closingIndex = trimmed.indexOf("'''", 3);
    if (closingIndex !== -1) {
      return trimmed.slice(3, closingIndex).trim();
    }
  }
  return null;
}

module.exports = {
  prompt: generatePythonDocstringPrompt,
  update: updatePythonFileWithDocstring,
  getDocstring: getPythonDocstring
}; 