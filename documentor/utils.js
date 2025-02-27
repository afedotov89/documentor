/*
 * Module with utilities for documentation.
 */

async function answerDocstring(GPTClient, customPrompt) {
  const standardPrompt = `Generate a docstring that provides a clear technical description of the code.

Ensure that the docstring meets the following criteria:
- Provides a concise, general overview of the functionality
- Describes parameters and return values if present
- Does not include implementation details
- Does not include usage examples
- Each line is no longer than 100 characters
- Remains professional and focused solely on the provided content
- Uses clear, technical language`;
  
  // Use customPrompt if provided, otherwise use the standard prompt
  const basePrompt = customPrompt || standardPrompt;
  const prompt = basePrompt + `\nGenerate a docstring for the function in JSON format. Output format: {\"docstring\": \"<function description>\"}. Return only JSON.`;

  // If response_format is set as a string in defaultOptions, pass an empty object through options
  const options = { response_format: { "type": "json_object" }};
  const jsonResponse = await GPTClient.answer(prompt, options);

  let parsed;
  try {
    parsed = JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Failed JSON response: ", jsonResponse);
    throw new Error("Failed to parse JSON: " + error.message);
  }

  let docString = parsed.docstring;

  if (typeof docString === 'string') {
    docString = docString.trim();
    // Remove quotes from beginning and end if present
    if ((docString.startsWith('"') && docString.endsWith('"')) || 
        (docString.startsWith("'") && docString.endsWith("'"))) {
      docString = docString.slice(1, -1);
    }
  }

  return docString;
}

/**
 * Generates a detailed description of file contents
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @returns {Promise<string>} - Detailed file description
 */
async function generateDetailedDescription(GPTClient, filePath, content) {
  const fileName = filePath.split('/').pop();
  const fileExt = fileName.split('.').pop().toLowerCase();
  
  // Create prompt depending on file type
  let prompt = `Analyze the contents of file '${fileName}' and provide a detailed technical description including:
1. Primary purpose of the file
2. Key functions/classes and their roles
3. Important dependencies and interactions with other components
4. Implementation specifics or algorithms

File content:
\`\`\`
${content}
\`\`\`

Return response in JSON format. Output format: {"description": "<detailed_description>"}. Return only JSON.`;

  const options = { response_format: { "type": "json_object" }};
  const jsonResponse = await GPTClient.answer(prompt, options);

  let parsed;
  try {
    parsed = JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Failed JSON response: ", jsonResponse);
    throw new Error("Failed to parse JSON: " + error.message);
  }

  return parsed.description || '';
}

/**
 * Analyzes code and returns a list of public members of the file
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @returns {Promise<Array>} - Array of objects with information about public members
 */
async function getMembers(GPTClient, filePath, content) {
  const fileName = filePath.split('/').pop();
  
  const prompt = `Analyze the contents of file '${fileName}' and list all public members:
- Classes (class)
- Functions (function)
- Public variables/constants (variable)
Do not include private elements (starting with _).

For each element specify:
1. Type (class/function/variable)
2. Name
3. Brief description (1 sentence)

Response format: JSON with array of objects: {"members": [{"type": "<type>", "name": "<name>", "description": "<description>"}]}. Return only JSON.

File content:
\`\`\`
${content}
\`\`\``;

  const options = { response_format: { "type": "json_object" }};
  const jsonResponse = await GPTClient.answer(prompt, options);

  let parsed;
  try {
    parsed = JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Failed JSON response: ", jsonResponse);
    throw new Error("Failed to parse JSON: " + error.message);
  }

  // Check and normalize response structure
  if (!parsed.members) {
    console.warn("Invalid response format for file members:", parsed);
    return [];
  }

  return parsed.members.filter(item => 
    item?.type && 
    item?.name &&
    ['class', 'function', 'variable'].includes(item.type) &&
    !item.name.startsWith('_')
  );
}

/**
 * Generates a detailed description of a directory based on its contents
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} directoryPath - Path to the directory
 * @param {Array} members - Array of directory elements (from getMembers)
 * @returns {Promise<string>} - Detailed directory description
 */
async function generateDirectoryDescription(GPTClient, directoryPath, members) {
  const dirName = directoryPath.split('/').pop() || directoryPath.split('/').slice(-2)[0];
  
  const membersList = members.map(m => 
    `- [${m.type}] ${m.name}: ${m.description}`
  ).join('\n');

  const prompt = `Analyze the structure of directory '${dirName}' and provide a detailed technical description including:
1. Overall purpose and responsibility of the directory
2. Main components/modules and their roles
3. Key interactions between components
4. Architectural patterns or notable design decisions

Directory structure:
${membersList}

Return response in JSON format. Output format: {"description": "<detailed_description>"}. Return only JSON.`;

  const options = { response_format: { "type": "json_object" }};
  const jsonResponse = await GPTClient.answer(prompt, options);

  let parsed;
  try {
    parsed = JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Failed JSON response: ", jsonResponse);
    throw new Error("Failed to parse JSON: " + error.message);
  }

  return parsed.description || '';
}

/**
 * Adds documentation comments to all public members of a file while preserving existing comments and formatting
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @returns {Promise<string>} - Updated file content with added documentation
 */
async function addDocumentation(GPTClient, filePath, content) {
  const fileName = filePath.split('/').pop();
  const fileExt = fileName.split('.').pop().toLowerCase();
  
  const prompt = `Add docstrings to the provided code file while following these requirements strictly:

1. Preserve ALL existing code functionality exactly as is
2. Preserve ALL existing docstrings and comments - do not modify or remove them
3. Preserve ALL existing code formatting exactly, including whitespace and indentation
4. Add docstrings only where they are missing:
   - Add a file-level docstring if missing
   - Document all public functions, classes, and significant variables that don't have documentation
   - Ignore private members
5. Follow the documenting style of existing docstrings in the file if present
6. If no existing style, use language-specific documentation conventions.
7. Generate concise but informative technical descriptions

File: '${fileName}'
Original content:
======== START OF FILE CONTENT ========
${content}
======== END OF FILE CONTENT ========

Return response in JSON format: {"content": "<complete_file_content_with_added_documentation>"}.
The content field should contain the ENTIRE file content with all documentation added.
Return only valid JSON.`;

  const options = { response_format: { "type": "json_object" }};
  const jsonResponse = await GPTClient.answer(prompt, options);

  let parsed;
  try {
    parsed = JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Failed JSON response: ", jsonResponse);
    throw new Error("Failed to parse JSON: " + error.message);
  }

  if (!parsed.content) {
    throw new Error("Invalid response format: missing content field");
  }

  return parsed.content;
}

module.exports = { answerDocstring, generateDetailedDescription, getMembers, generateDirectoryDescription, addDocumentation };
