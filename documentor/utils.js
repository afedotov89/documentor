/*
 * Module with utilities for documentation.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { lockManager } = require('./utils/lockManager');

/**
 * File lock management module
 */
// Imported from ./utils/lockManager.js
module.exports.lockManager = lockManager;

/**
 * Responsible for generating docstring based on file content
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} contentDescription - Description of file content
 * @returns {Promise<string>} - Generated docstring
 */
async function answerDocstring(GPTClient, contentDescription) {
  const prompt = `Generate a docstring that provides a clear technical description of the content:

  ${contentDescription}

Ensure that the docstring meets the following criteria:
- Provides a concise, general overview of the functionality
- Does not point out obvious things like programming language, "it is a file", file name, etc. 
- Does not not use the path in the description. Use it only for understanding the context
- Does not include implementation details
- Does not include usage examples
- Each line is no longer than 100 characters
- Remains professional and focused solely on the provided content
- Uses clear, technical language

Generate a docstring for the content in JSON format. Output format: {\"docstring\": \"<docstring text>\"}. Return only JSON.`;
  
  // Use customPrompt if provided, otherwise use the standard prompt
  

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
3. Brief description including parameters and return values

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
 * Checks if a file has syntax errors using VSCode diagnostics
 * @param {Object} vscode - VSCode API instance
 * @param {string} filePath - Path to the file
 * @param {Object} outputChannel - VSCode output channel for logging
 * @returns {Promise<Object>} - Object with isValid flag and error messages
 */ 
async function validateFileSyntax(vscode, filePath, outputChannel) {
  if (!vscode) {
    return { isValid: true, errors: [] }; // Skip validation if not in VSCode environment
  }
  
  console.log(`Validating syntax for file: ${filePath}`);
  
  try {
    // Check if required vscode APIs exist
    if (!vscode.Uri || !vscode.languages || !vscode.languages.getDiagnostics) {
      outputChannel?.appendLine(`Error during syntax validation: Required vscode APIs not available`);
      return { isValid: true, errors: [] }; // Consider valid if we can't validate
    }

    // Create URI from file path
    const fileUri = vscode.Uri.file(filePath);
    
    // Wait for diagnostics to be ready (they may be generated asynchronously)
    // Give some time for language services to analyze the file
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get diagnostics from VSCode
    const diagnostics = vscode.languages.getDiagnostics(fileUri);
    
    // Filter only errors (ignore warnings)
    const errors = diagnostics.filter(diag => 
      diag.severity === vscode.DiagnosticSeverity.Error
    );
    
    const result = {
      isValid: errors.length === 0,
      errors: errors.map(error => ({
        line: error.range.start.line + 1,
        column: error.range.start.character + 1,
        message: error.message
      }))
    };
    
    if (!result.isValid) {
      console.log(`Found ${errors.length} syntax error(s):`);
      result.errors.forEach(error => {
        console.log(`  - Line ${error.line}, Col ${error.column}: ${error.message}`);
      });
    } else {
      console.log('File syntax is valid.');
    }
    
    return result;
  } catch (error) {
    outputChannel?.appendLine(`Error during syntax validation: ${error.message}`);
    return { isValid: true, errors: [] }; // Consider valid if we can't validate
  }
}

/**
 * Adds documentation comments to all public members of a file while preserving existing comments and formatting
 * Includes syntax validation before and after documentation
 * @param {Object} GPTClient - Client for interacting with OpenAI API
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @param {Object} settings - Plugin settings (optional)
 * @param {Object} vscode - VSCode API object (optional)
 * @param {Object} outputChannel - VSCode output channel for logging (optional)
 * @returns {Promise<Object>} - Updated file content with added documentation and validation info
 */
async function addDocumentation(GPTClient, filePath, content, settings, vscode = null, outputChannel = null) {
  const MAX_ATTEMPTS = 3;
  const fileName = filePath.split('/').pop();
  const fileExt = fileName.split('.').pop().toLowerCase();
  
  // Check if vscode is available and has required APIs for validation
  const canValidate = vscode && vscode.Uri && vscode.languages && vscode.languages.getDiagnostics;
  
  // Step 1: Validate file syntax before documentation (only if validation is possible)
  let beforeValidation = { isValid: true, errors: [] };
  if (canValidate) {
    beforeValidation = await validateFileSyntax(vscode, filePath, outputChannel);
    if (!beforeValidation.isValid) {
      outputChannel?.appendLine(`WARNING: File has syntax errors before documentation. Skipping documentation for ${filePath}`);
      outputChannel?.appendLine(`Syntax errors in file:`);
      beforeValidation.errors.forEach(error => {
        outputChannel?.appendLine(`  - Line ${error.line}, Col ${error.column}: ${error.message}`);
      });
      
      // Return early with validation information
      return {
        content: content, // Return original content
        syntaxValid: false,
        validationResult: beforeValidation,
        attempts: 0,
        success: false,
        skipped: true,
        reason: "File has syntax errors"
      };
    }
  }
  
  // Determine language based on file extension
  let language = '';
  
  if (fileExt === 'py') {
    language = 'Python';
  } else if (fileExt === 'js' || fileExt === 'ts') {
    language = 'JavaScript/TypeScript';
  } else if (fileExt === 'java') {
    language = 'Java';
  } else if (fileExt === 'c' || fileExt === 'cpp' || fileExt === 'h' || fileExt === 'hpp') {
    language = 'C/C++';
  } else {
    language = 'Generic';
  }
  
  // Get documentation format from settings
  const documentationFormat = getDocFormatFromSettings(settings, fileExt);
  
  let attempts = 0;
  let documentedContent = content;
  let validationResult = null;
  let success = false;
  
  while (attempts < MAX_ATTEMPTS && !success) {
    attempts++;
    console.log(`Documentation attempt ${attempts}/${MAX_ATTEMPTS} for ${fileName}`);
    
    try {
      // Create prompt for documentation
      const prompt = `Add docstrings to the provided code file while following these requirements strictly:

1. Preserve ALL existing code functionality exactly as is
2. Preserve ALL existing docstrings and comments - do not modify or remove them
3. Preserve ALL existing code formatting exactly, including whitespace and indentation
4. Add docstrings only where they are missing:
   - Add a file-level docstring if missing
   - Document all public functions, classes, and significant variables that don't have documentation
   - Ignore private members
5. Follow the documenting style of existing docstrings in the file if present
6. If no existing style, use ${documentationFormat} format for ${language} documentation
7. Generate concise but informative technical descriptions

File: '${fileName}'
Original content:
======== START OF FILE CONTENT ========
${documentedContent}
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
        outputChannel?.appendLine(`Failed JSON response: ${jsonResponse}`);
        throw new Error("Failed to parse JSON: " + error.message);
      }

      if (!parsed.content) {
        throw new Error("Invalid response format: missing content field");
      }

      documentedContent = parsed.content;
      
      // Skip syntax validation if vscode is unavailable or missing required APIs
      if (!canValidate) {
        success = true;
        break;
      }
      
      try {
        // Temporarily write the content to validate it
        const fs = require('fs');
        const originalContent = fs.readFileSync(filePath, 'utf-8');
        fs.writeFileSync(filePath, documentedContent, 'utf-8');
        
        // Step 3: Validate file syntax after documentation
        validationResult = await validateFileSyntax(vscode, filePath, outputChannel);
        
        // Step 4: Restore original content while we decide what to do
        fs.writeFileSync(filePath, originalContent, 'utf-8');
        
        // If syntax is valid, we're done
        if (validationResult.isValid) {
          success = true;
          console.log(`Documentation successful on attempt ${attempts} with valid syntax.`);
          break;
        } else {
          console.log(`Documentation attempt ${attempts} introduced syntax errors. Retrying...`);
        }
      } catch (error) {
        outputChannel?.appendLine(`Error during validation: ${error.message}`);
        // Continue as if validation was successful in case of errors
        success = true; 
        break;
      }
    } catch (error) {
      outputChannel?.appendLine(`Error during documentation attempt ${attempts}: ${error.message}`);
    }
  }
  
  return {
    content: documentedContent,
    syntaxValid: success || !canValidate, // Consider valid if validation isn't possible
    validationResult: validationResult,
    attempts: attempts,
    success: success,
    skipped: false
  };
}

/**
 * Returns available documentation formats for specified language to use in plugin settings
 * @param {string} language - Programming language
 * @returns {Object} - Object with format options and default format for plugin settings
 */
function getDocumentationFormats(language) {
  const formats = {
    python: {
      options: [
        "reStructuredText (reST)",
        "Google style",
        "NumPy/SciPy style",
        "Epytext",
        "PEP 257"
      ],
      default: "reStructuredText (reST)"
    },
    javascript: {
      options: ["JSDoc", "TypeDoc"],
      default: "JSDoc"
    },
    java: {
      options: ["Javadoc"],
      default: "Javadoc"
    },
    cpp: {
      options: ["Doxygen", "Natural Docs"],
      default: "Doxygen"
    }
  };

  // Return formats for specified language or default formats if language not supported
  return formats[language.toLowerCase()] || { options: ["Standard comments"], default: "Standard comments" };
}

/**
 * Gets documentation format from plugin settings based on file extension
 * @param {Object} settings - Plugin settings object
 * @param {string} fileExt - File extension
 * @returns {string} - Documentation format to use
 */
function getDocFormatFromSettings(settings, fileExt) {
  // Default format mapping
  const defaultMapping = {
    'py': 'reStructuredText (reST)',
    'js': 'JSDoc',
    'ts': 'JSDoc',
    'java': 'Javadoc',
    'c': 'Doxygen',
    'cpp': 'Doxygen',
    'h': 'Doxygen',
    'hpp': 'Doxygen'
  };
  
  // If no settings provided or no docFormats in settings
  if (!settings || !settings.docFormats) {
    return defaultMapping[fileExt] || 'Standard comments';
  }
  
  // Try to get format from settings based on file extension
  if (fileExt === 'py' && settings.docFormats.python) {
    return settings.docFormats.python;
  } else if ((fileExt === 'js' || fileExt === 'ts') && settings.docFormats.javascript) {
    return settings.docFormats.javascript;
  } else if (fileExt === 'java' && settings.docFormats.java) {
    return settings.docFormats.java;
  } else if (['c', 'cpp', 'h', 'hpp'].includes(fileExt) && settings.docFormats.cpp) {
    return settings.docFormats.cpp;
  }
  
  // Fallback to default
  return defaultMapping[fileExt] || 'Standard comments';
}

// Export functions
module.exports = { answerDocstring, generateDetailedDescription, getMembers, generateDirectoryDescription, addDocumentation, getDocumentationFormats, getDocFormatFromSettings, validateFileSyntax };
