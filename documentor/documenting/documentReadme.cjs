/**
 * README.md Generation System
 * 
 * This module provides functionality for intelligent README.md generation for software projects.
 * It leverages OpenAI's language models to create comprehensive, well-structured project documentation
 * based on indexed information about project files and components.
 * 
 * Key features:
 * 1. Analysis of existing README.md files for incremental updates
 * 2. Intelligent section-based content generation
 * 3. Progressive refinement of content through iterative LLM queries
 * 4. Component-specific documentation improvement
 * 
 * The workflow is as follows:
 * 
 * 1. Collection Phase:
 *    - Project information is collected from the index manager
 *    - Existing README.md is analyzed and parsed into sections if it exists
 *    - Project structure and key files are identified
 * 
 * 2. Generation Phase:
 *    - For each requested section, an initial content prompt is created
 *    - OpenAI API is queried to generate initial section content
 *    - The generated content is analyzed to identify areas needing more detail
 *    - Additional information is collected about specific components
 *    - Section content is iteratively refined through follow-up prompts
 * 
 * 3. Assembly Phase:
 *    - Generated sections are assembled according to the defined section order
 *    - Non-generated sections from the original README are preserved
 *    - Final README content is returned for saving
 * 
 * The module uses a sophisticated deepening strategy that:
 * - Identifies which project components need more detailed documentation
 * - Gathers specific information about those components
 * - Incorporates that information into improved section content
 * - Repeats this process until sufficient detail is achieved
 * 
 * This approach results in high-quality documentation that is:
 * - Comprehensive: Covers all important aspects of the project
 * - Accurate: Based on actual project structure and code
 * - Maintainable: Can be iteratively updated as the project evolves
 * - Consistent: Follows standard README conventions and formatting
 */

/**
 * README.md generation utilities based on project indexes
 */

const fs = require('fs');
const path = require('path');

// Import getOutputChannel function from documentGenerator
let getOutputChannel;
try {
  const documentGenerator = require('../documentGenerator.cjs');
  getOutputChannel = documentGenerator.getOutputChannel;
} catch (error) {
  console.error('Failed to import documentGenerator:', error);
  // Fallback for testing
  getOutputChannel = () => console;
}

// Import the index manager
let indexManager;
try {
  const { indexManager: manager } = require('../indexing/indexManager.cjs');
  indexManager = manager;
} catch (error) {
  console.error('Failed to import indexManager:', error);
  // Fallback for testing
  indexManager = {
    getFileInfo: () => null,
    getIndexFilePaths: () => ({ projectIndexDir: '' })
  };
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

/**
 * Parses README.md into sections based on markdown headers
 * @param {string} readmeContent - Content of the existing README.md
 * @param {object} sectionTitles - Mapping of section keys to their titles
 * @returns {object} Parsed sections with their content
 */
function parseReadmeIntoSections(readmeContent, sectionTitles) {
  // Default empty structure for the result
  const sectionContents = {};
  
  // Initialize with empty content for all known sections
  Object.keys(sectionTitles).forEach(sectionKey => {
    sectionContents[sectionKey] = '';
  });
  
  if (!readmeContent) {
    return sectionContents;
  }
  
  // Create a reverse mapping from titles to keys
  const titleToKey = {};
  Object.entries(sectionTitles).forEach(([key, title]) => {
    titleToKey[title] = key;
    // Also map the title without "Information", "Guide", etc. for flexibility
    const simplifiedTitle = title.replace(/(Information|Guide|Guidelines|Instructions|Reference)$/, '').trim();
    if (simplifiedTitle !== title) {
      titleToKey[simplifiedTitle] = key;
    }
  });
  
  // Split the content by markdown headers (## Title)
  const sectionRegex = /^##\s+(.+?)(?=\n##|\n*$)/gms;
  let match;
  let lastSectionKey = null;
  let remainingContent = readmeContent;
  
  // Extract the main title and description (before any ## headers)
  const mainTitleMatch = readmeContent.match(/^#\s+(.+?)(?=\n##|\n*$)/ms);
  if (mainTitleMatch) {
    sectionContents['project-title'] = mainTitleMatch[0];
    remainingContent = remainingContent.replace(mainTitleMatch[0], '').trim();
  }
  
  // Process all ## section headers
  while ((match = sectionRegex.exec(remainingContent)) !== null) {
    const fullMatch = match[0];
    const headerLine = match[1].split('\n')[0].trim();
    
    // Try to match the header with our known section titles
    let sectionKey = null;
    
    // Direct match with exact title
    Object.entries(sectionTitles).forEach(([key, title]) => {
      if (headerLine.toLowerCase() === title.toLowerCase()) {
        sectionKey = key;
      }
    });
    
    // If no direct match, try with the title-to-key mapping
    if (!sectionKey) {
      Object.entries(titleToKey).forEach(([title, key]) => {
        if (headerLine.toLowerCase().includes(title.toLowerCase())) {
          sectionKey = key;
        }
      });
    }
    
    // If we found a matching section, save its content
    if (sectionKey) {
      sectionContents[sectionKey] = fullMatch;
      lastSectionKey = sectionKey;
    } else if (lastSectionKey) {
      // If no matching section but we have a last section, append to it
      // This handles subsections that belong to a main section
      sectionContents[lastSectionKey] += '\n' + fullMatch;
    }
  }
  
  return sectionContents;
}

/**
 * Recursively collects all indexed files and directories from a project
 * @param {string} projectPath - Path to the root of the project
 * @param {object} manager - Instance of IndexManager
 * @returns {object} Hierarchical structure of indexed files/directories
 */
function collectProjectIndexData(projectPath, manager = indexManager) {
  const result = {
    root: null,
    files: {}
  };
  
  // Get the root project info
  const rootInfo = manager.getFileInfo(projectPath);
  result.root = rootInfo;
  
  if (!rootInfo) {
    return result;
  }
  
  // Recursively collect all indexed files
  function collectFiles(dirPath) {
    const info = manager.getFileInfo(dirPath);
    if (!info) return;
    
    result.files[dirPath] = info;
    
    // If it's a directory, process its members
    if (info.isDirectory && Array.isArray(info.members)) {
      info.members.forEach(member => {
        const memberPath = path.join(dirPath, member.name);
        collectFiles(memberPath);
      });
    }
  }
  
  collectFiles(projectPath);
  return result;
}

/**
 * Returns description instruction for a specific README section
 * @param {string} sectionKey - Key of the section
 * @returns {string} Instruction text for the section
 */
function getSectionPromptInstruction(sectionKey) {
  switch (sectionKey) {
    case 'project-title':
      return `create or update the main title and short description of the Project (not a directory or file). You should describe the project as a whole, not its low-level contents.`;
    case 'overview':
      return `write a concise overview of key components of the project.`;
    case 'features':
      return `list the key features of this project.`;
    case 'requirements':
      return `list the system requirements and dependencies needed to use this project.`;
    case 'installation':
      return `provide clear installation instructions.`;
    case 'usage-examples':
      return `provide examples of how to use this project.`;
    case 'structure':
      return `outline the project's directory structure and organization.`;
    case 'api':
      return `document the API (functions, classes, methods) provided by this project.`;
    case 'testing':
      return `explain how to run tests for this project.`;
    case 'deployment':
      return `provide guidance on how to deploy this project.`;
    case 'contributing':
      return `explain how others can contribute to this project.`;
    case 'license':
      return `specify license information for this project.`;
    case 'authors':
      return `list the authors and contributors to this project.`;
    default:
      return `generate content for this section of the README.`;
  }
}

/**
 * Creates a prompt for LLM to generate/update a README section
 * @param {string} sectionKey - Key of the section
 * @param {string} sectionTitle - Display title of the section
 * @param {string} currentContent - Current content of the section
 * @param {object} indexData - Project index data
 * @returns {string} Formatted prompt for LLM
 */
function createLlmPrompt(sectionKey, sectionTitle, currentContent, indexData, level = 1) {
  let prompt = `I need your help to generate the "${sectionTitle}" section of a README.md file for a project. `;
  
  // Add information about the project from the root index
  if (indexData.root) {
    prompt += `\n\nHere's the information about the directory containing the project:\n`;
    prompt += `- Name: ${path.basename(indexData.root.filePath)}\n`;
    
    if (indexData.root.docstring) {
      prompt += `- Short description: ${indexData.root.docstring}\n`;
    }
    
    if (indexData.root.description) {
      prompt += `- Detailed description: ${indexData.root.description}\n`;
    }
    
    if (indexData.root.members && indexData.root.members.length > 0) {
      prompt += `\nDirectory contents:\n`;
      indexData.root.members.forEach(member => {
        prompt += `- ${member.name}${member.type ? ` (${member.type})` : ''}${member.docstring ? `: ${member.docstring}` : ''}\n`;
      });
    }
  }
  
//   // Add information about package.json if available
//   const packageJsonPath = Object.keys(indexData.files).find(filePath => 
//     filePath.endsWith('package.json')
//   );
  
//   if (packageJsonPath && indexData.files[packageJsonPath]) {
//     const packageInfo = indexData.files[packageJsonPath];
//     prompt += `\nPackage information:\n`;
//     if (packageInfo.docstring) prompt += `- Description: ${packageInfo.docstring}\n`;
//     if (packageInfo.members && packageInfo.members.length > 0) {
//       // Extract relevant package.json fields (dependencies, scripts, etc.)
//       const dependencies = packageInfo.members.find(m => m.name === 'dependencies');
//       const devDependencies = packageInfo.members.find(m => m.name === 'devDependencies');
//       const scripts = packageInfo.members.find(m => m.name === 'scripts');
      
//       if (dependencies) prompt += `- Dependencies: ${dependencies.docstring || 'Available'}\n`;
//       if (devDependencies) prompt += `- Dev Dependencies: ${devDependencies.docstring || 'Available'}\n`;
//       if (scripts) prompt += `- Scripts: ${scripts.docstring || 'Available'}\n`;
//     }
//   }
  
  // Add specific instructions based on the section
  prompt += `\n\nBased on this information, I need you to `;
  prompt += getSectionPromptInstruction(sectionKey);
  
  prompt += `\nDo include the section header (${'#'.repeat(level)} ${sectionTitle}) if it is not already present in the content.
You should not use all the information provided above, but only use it as a source of content.
You do not need to copy the style of the information provided above.
Avoid writing excessively long or overly short text; aim for a reasonable length that is appropriate for that specific section, as is common in most well-regarded coding projects.
The content must be written at a professional level, concise yet informative, following the best practices of README files from top coding projects.
Avoid unnecessary fluff and ensure clarity and precision in the information provided.\n`;

prompt += `\nCurrent content of the section:
=========== START OF CONTENT ============
${currentContent}
=========== END OF CONTENT ============

Provide me with improved markdown content for this section only.

Return your response in JSON format: {"content": "your improved markdown content here"}.
Return only valid JSON.\n`;
  
  return prompt;
}


/**
 * Asks LLM which parts of the project need more information for the section
 * @param {string} sectionKey - Key of the section
 * @param {string} sectionTitle - Display title of the section
 * @param {string} currentContent - Current content generated for the section
 * @param {object} indexData - Project index data with root and files
 * @param {function} llmClient - Function to query LLM
 * @returns {Array} Array of file/directory paths that need more information
 */
async function identifyNeededAdditionalInfo(sectionKey, sectionTitle, currentContent, indexData, llmClient) {
  let prompt = `I'm generating the "${sectionTitle}" section of a README.md for a project. `;
  prompt += `I've created some initial content based on high-level project information.\n\n`;
  prompt += `Current section content:\n${currentContent}\n\n`;
  
  // List available project parts that could provide more information
  prompt += `Here are the main components of the project that I could get more detailed information about:\n`;
  
  if (indexData.root && indexData.root.members) {
    indexData.root.members.forEach(member => {
      prompt += `- ${member.name}${member.type ? ` (${member.type})` : ''}${member.docstring ? `: ${member.docstring}` : ''}\n`;
    });
  }
  
  prompt += `\nBased on the current content of the "${sectionTitle}" section, do I need more detailed information about any specific part of the project to improve this section? `;
  prompt += `If yes, please specify which component(s) would be most valuable to explore further. `;
  prompt += `If no additional information is needed, please respond with "No additional information needed."\n\n`;
  prompt += `Your response should be in this format within a JSON object:\n`;
  prompt += `{\n`;
  prompt += `  "analysis": {\n`;
  prompt += `    "need_more_info": "Yes" or "No",\n`;
  prompt += `    "components": ["component1", "component2", ...] or [],\n`;
  prompt += `    "reason": "explanation of why these components would help"\n`;
  prompt += `  }\n`;
  prompt += `}\n\n`;
  prompt += `Return only valid JSON.`;
  
  // Query the LLM
  const response = await llmClient(prompt, {
    response_format: { "type": "json_object" }
  });
  
  // Declare components before the try-catch block
  let components = [];
  let needMoreInfo = false;
  
  // Parse the JSON response
  try {
    const parsedResponse = JSON.parse(response);
    const analysis = parsedResponse.analysis;
    
    if (!analysis) {
      return [];
    }
    
    needMoreInfo = analysis.need_more_info === 'Yes';
    if (!needMoreInfo) {
      return [];
    }
    
    if (Array.isArray(analysis.components)) {
      components = analysis.components.filter(c => c && typeof c === 'string');
    }
    
  } catch (error) {
    // Fallback to regular expression extraction if JSON parsing fails
    needMoreInfo = /NEED_MORE_INFO:\s*Yes/i.test(response);
    
    if (!needMoreInfo) {
      return [];
    }
    
    const componentsMatch = response.match(/COMPONENTS:\s*([^]*?)(?=\nREASON:|$)/i);
    if (componentsMatch && componentsMatch[1]) {
      components = componentsMatch[1].split(',').map(c => c.trim()).filter(c => c && c.toLowerCase() !== 'none');
    }
  }
  
  return components;
}

/**
 * Iteratively improves section content by requesting more specific index data
 * @param {string} sectionKey - Key of the section 
 * @param {string} sectionTitle - Display title of the section
 * @param {string} initialContent - Initial content generated for the section
 * @param {object} indexData - Full project index data
 * @param {string} projectPath - Path to the project root
 * @param {object} client - ChatGPT client instance
 * @param {number} maxIterations - Maximum number of improvement iterations
 * @returns {string} Finalized section content
 */
async function deepenSectionContent(sectionKey, sectionTitle, initialContent, indexData, projectPath, client, maxIterations = 3, allSections = {}, originalSections = {}, sectionOrder = []) {
  // Get the common output channel
  const outputChannel = getOutputChannel();
  
  // Show output channel to user
  if (outputChannel && typeof outputChannel.show === 'function') {
    outputChannel.show();
  }
  
  let currentContent = initialContent;
  let iterations = 0;
  let exploredComponents = new Set();
  
  // Get the path to the README file
  const readmePath = path.join(projectPath, 'README.md');
  
  // Helper function for updating README file
  const updateReadmeFile = async (updatedSectionContent) => {
    try {
      // Update the current section in the set of all sections
      const updatedSections = { ...allSections };
      updatedSections[sectionKey] = updatedSectionContent;
      
      // Use assembleReadme to create the file content
      const readmeContent = assembleReadme(updatedSections, originalSections, sectionOrder);
      
      // Write to file
      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    } catch (error) {
      console.error(`Error updating README.md with improved section ${sectionTitle}: ${error.message}`);
    }
  };
  
  while (iterations < maxIterations) {
    // Ask what additional components we need to explore
    console.log(`Iteration ${iterations + 1}/${maxIterations} for section ${sectionTitle}`);
    const neededInfoPrompt = createNeededInfoPrompt(sectionKey, sectionTitle, currentContent, indexData);
    const infoResponse = await client.answer(neededInfoPrompt, { 
      temperature: 0.3,
      response_format: { "type": "json_object" }
    });
    
    // Declare componentsToExplore before the try-catch block
    let componentsToExplore = [];
    
    // Parse JSON response
    let parsedInfoResponse;
    try {
      parsedInfoResponse = JSON.parse(infoResponse);
      // Extract the needed information from the JSON response
      const analysis = parsedInfoResponse.analysis;
      
      if (!analysis || typeof analysis !== 'object') {
        console.error('Warning: Invalid JSON structure, missing \'analysis\' object');
        throw new Error('Invalid JSON structure');
      }
      
      // Check if additional information is needed
      const needMoreInfo = analysis.need_more_info === 'Yes';
      if (!needMoreInfo) {
        console.log(`No additional information needed for section ${sectionTitle}`);
        break;
      }
      
      // Get the list of components to explore
      componentsToExplore = Array.isArray(analysis.components) ? 
                                  analysis.components.filter(c => c && typeof c === 'string') : 
                                  [];
      
      if (componentsToExplore.length === 0) {
        console.log(`No specific components identified for section ${sectionTitle}`);
        break;
      }
      
    } catch (error) {
      // Fallback to direct string parsing if JSON parsing fails
      console.error(`Warning: JSON parsing failed (${error.message}), using direct string parsing`);
      
      // Original string parsing logic
      const needMoreInfo = /NEED_MORE_INFO:\s*Yes/i.test(infoResponse);
      if (!needMoreInfo) {
        console.log(`No additional information needed for section ${sectionTitle}`);
        break;
      }
      
      const componentsMatch = infoResponse.match(/COMPONENTS:\s*([^]*?)(?=\nREASON:|$)/i);
      if (!componentsMatch || !componentsMatch[1]) {
        console.log(`No specific components identified for section ${sectionTitle}`);
        break;
      }
      
      componentsToExplore = componentsMatch[1]
        .split(',')
        .map(c => c.trim())
        .filter(c => c && c.toLowerCase() !== 'none');
    }
    
    // If no more components to explore or we've explored all suggested components, we're done
    if (componentsToExplore.length === 0 || 
        componentsToExplore.every(comp => exploredComponents.has(comp))) {
      console.log(`All suggested components already explored for section ${sectionTitle}`);
      break;
    }
    
    // Gather additional index data for the requested components
    const additionalData = {};
    
    for (const component of componentsToExplore) {
      if (exploredComponents.has(component)) continue;
      
      // Mark this component as explored
      exploredComponents.add(component);
      console.log(`Exploring component: ${component}`);
      
      // Find the file path for this component
      const componentPath = path.join(projectPath, component);
      const componentInfo = indexData.files[componentPath];
      
      if (componentInfo) {
        additionalData[component] = componentInfo;
      }
    }
    
    // If we found additional data, generate a new prompt with it
    if (Object.keys(additionalData).length > 0) {
      const improvePrompt = createImprovePrompt(sectionTitle, currentContent, additionalData);
      const improvedContent = await client.answer(improvePrompt, { 
        temperature: 0.5,
        response_format: { "type": "json_object" }
      });
      
      // Parse JSON response and extract content
      let parsedContent;
      try {
        parsedContent = JSON.parse(improvedContent);
        // Extract the content from the parsed JSON - assuming the first property contains the content
        const contentKey = Object.keys(parsedContent)[0];
        currentContent = `${parsedContent[contentKey].trim()}`;
      } catch (error) {
        // Fallback to direct string if JSON parsing fails
        logger.appendLine(`Warning: JSON parsing failed for improved content, using direct string`);
        currentContent = `${improvedContent.trim()}`;
      }
      
      logger.appendLine(`Updated content for section ${sectionTitle}`);
      
      // Update the current section in the set of all sections
      // Update README.md with improved section content
      await updateReadmeFile(currentContent);
    } else {
      logger.appendLine(`No additional data found for requested components in section ${sectionTitle}`);
      break;
    }
    
    iterations++;
  }
  
  return currentContent;
}

/**
 * Creates a prompt to identify needed additional information
 * @param {string} sectionKey - Key of the section
 * @param {string} sectionTitle - Display title of the section
 * @param {string} currentContent - Current content of the section
 * @param {object} indexData - Project index data
 * @returns {string} Formatted prompt
 */
function createNeededInfoPrompt(sectionKey, sectionTitle, currentContent, indexData) {
  let prompt = `I'm generating the "${sectionTitle}" section of a README.md for a project. `;
  prompt += `I've created some initial content based on high-level project information.\n\n`;
  prompt += `Current section content:
=========== START OF CONTENT ============
  ${currentContent}
=========== END OF CONTENT ============\n\n`;
  
  // List available project parts that could provide more information
  prompt += `Here are the main components of the project that I could get more detailed information about:\n`;
  
  if (indexData.root && indexData.root.members) {
    indexData.root.members.forEach(member => {
      prompt += `- ${member.name}${member.type ? ` (${member.type})` : ''}${member.docstring ? `: ${member.docstring}` : ''}\n`;
    });
  }
  
  prompt += `\nBased on the current content of the section, do I need more detailed information about any specific part of the project to significantly improve this section? `;
  prompt += `If yes, please specify which component(s) would be most valuable to explore further. `;
  prompt += `If no additional information is needed, please respond with "No additional information needed."\n\n`;
  prompt += `Your response should be in this format within a JSON object:\n`;
  prompt += `{\n`;
  prompt += `  "analysis": {\n`;
  prompt += `    "need_more_info": "Yes" or "No",\n`;
  prompt += `    "components": ["component1", "component2", ...] or [],\n`;
  prompt += `    "reason": "explanation of why these components would help"\n`;
  prompt += `  }\n`;
  prompt += `}\n\n`;
  prompt += `Return only valid JSON.`;
  
  return prompt;
}

/**
 * Creates a prompt to improve section content with additional information
 * @param {string} sectionTitle - Display title of the section
 * @param {string} currentContent - Current content of the section
 * @param {object} additionalData - Additional data about components
 * @returns {string} Formatted prompt
 */
function createImprovePrompt(sectionTitle, currentContent, additionalData) {
  // Extract the section key from the section title (for use with getSectionPromptInstruction)
  // This is a simple conversion that assumes section titles and keys are closely related
  const sectionKey = sectionTitle.toLowerCase().replace(/\s+/g, '-');
  
  let prompt = `I'm improving the "${sectionTitle}" section of a README.md and need to incorporate more detailed information.\n\n`;
  prompt += `Current section content:
=========== START OF CONTENT ============
${currentContent}
=========== END OF CONTENT ============\n\n`;
  prompt += `Additional information about requested project components:\n\n`;
  
  Object.entries(additionalData).forEach(([component, info]) => {
    prompt += `### ${component}\n`;
    if (info.docstring) prompt += `Description: ${info.docstring}\n`;
    if (info.description) prompt += `Detailed description: ${info.description}\n`;
    
    if (info.members && info.members.length > 0) {
      prompt += `Contents:\n`;
      info.members.forEach(member => {
        prompt += `- ${member.name}${member.type ? ` (${member.type})` : ''}${member.docstring ? `: ${member.docstring}` : ''}\n`;
      });
    }
    prompt += `\n`;
  });
  
  prompt += `Please improve the "${sectionTitle}" section using this additional information. `;
  prompt += `For this section, I need you to ${getSectionPromptInstruction(sectionKey)}. `;
  prompt += `Provide the complete, updated content for this section in markdown format. `;
  prompt += `Do include the section header (## ${sectionTitle}) if it is not already present.\n`;
  prompt += `You do not need to use all the information provided above, but only use it as a source of content.
You do not need to copy the style of the information provided above.
You should not to document any obvious and common things that are very clear for professionals in the field. Focus on the unique values of the information provided.
Avoid writing excessively long or overly short text; aim for a reasonable length that is appropriate for that specific section, as is common in most well-regarded coding projects.
The content must be written at a professional level, concise yet informative, following the best practices of README files from top coding projects.
Avoid unnecessary fluff and ensure clarity and precision in the information provided.\n\n`;
  prompt += `Return your response in JSON format: {"content": "your improved markdown content here"}.\n`;
  prompt += `Return only valid JSON.`;
  
  return prompt;
}

/**
 * Assembles the final README.md combining all generated sections
 * @param {object} generatedSections - Object with generated content for each section
 * @param {object} originalSections - Object with original content for each section
 * @param {Array} sectionOrder - Order of sections in the final README
 * @returns {string} Complete README.md content
 */
function assembleReadme(generatedSections, originalSections, sectionOrder) {
  const result = [];
  
  // Process each section in the specified order
  sectionOrder.forEach(sectionKey => {
    // Use generated content if available, otherwise use original
    const sectionContent = generatedSections[sectionKey] || originalSections[sectionKey] || '';
    
    if (sectionContent) {
      result.push(sectionContent);
    }
  });
  
  return result.join('\n\n');
}

/**
 * Main function that orchestrates the README generation process
 * @param {string} projectPath - Path to the project
 * @param {Array} sectionsToGenerate - List of sections to regenerate
 * @param {object} options - Additional options
 * @returns {string} Generated README content
 */
async function generateProjectReadme(projectPath, sectionsToGenerate = [], options = {}) {
  // Get the common output channel
  const outputChannel = getOutputChannel();
  
  // Show output channel to user
  if (outputChannel && typeof outputChannel.show === 'function') {
    outputChannel.show();
  }
  
  const sectionTitles = options.sectionTitles;
  
  const sectionOrder = options.sectionOrder;
  
  // If no specific sections are requested, use default ones
  if (!sectionsToGenerate || sectionsToGenerate.length === 0) {
    sectionsToGenerate = Object.keys(sectionTitles);
  }
  
  // Read existing README.md if it exists
  let existingReadmeContent = '';
  const readmePath = path.join(projectPath, 'README.md');
  
  try {
    if (fs.existsSync(readmePath)) {
      existingReadmeContent = fs.readFileSync(readmePath, 'utf8');
    }
  } catch (error) {
    console.error(`Error reading README.md: ${error.message}`);
  }
  
  // Parse existing README into sections
  const originalSections = parseReadmeIntoSections(existingReadmeContent, sectionTitles);
  
  // Collect project index data
  const indexData = collectProjectIndexData(projectPath);
  
  // Create the OpenAI client, similar to how it's done in documentFile.cjs
  const configSettings = vscode.workspace.getConfiguration();
  const apiKey = configSettings.get('OpenAI API Key');
  const model = configSettings.get('model');
  
  if (!apiKey) {
    const errorMessage = 'Error: API key is missing from the configuration.';
    outputChannel.appendLine(errorMessage);
    if (vscode.window) {
      vscode.window.showErrorMessage(errorMessage);
    }
    throw new Error(errorMessage);
  }
  
  // Import and initialize the ChatGPT client
  const ChatGPTClient = require('../../openaiClient.cjs');
  const systemPrompt = 'You are a documentation assistant helping to create a high-quality README.md file.';
  const client = new ChatGPTClient(apiKey, model, systemPrompt);
  
  // Generate new content for requested sections
  const generatedSections = { ...originalSections };
  
  // Helper function for updating README file
  const updateReadmeFile = async () => {
    try {
      const readmeContent = assembleReadme(generatedSections, originalSections, sectionOrder);
      fs.writeFileSync(readmePath, readmeContent, 'utf8');
      outputChannel.appendLine(`README.md successfully updated`);
    } catch (error) {
      outputChannel.appendLine(`Error updating README.md: ${error.message}`);
    }
  };
  
  for (const sectionKey of sectionsToGenerate) {
    const sectionTitle = sectionTitles[sectionKey];
    
    if (!sectionTitle) {
      console.warn(`Unknown section key: ${sectionKey}`);
      continue;
    }
    
    outputChannel.appendLine(`Generating content for section: ${sectionTitle}`);
    
    // Generate initial content
    const level = sectionKey === 'project-title' ? 1 : 2;
    const sectionTitleAdopted = sectionKey === 'project-title' ? `# [Here must be a project title]` : `## ${sectionTitle}`;
    const currentContent = originalSections[sectionKey] || `${sectionTitleAdopted}`;
    const prompt = createLlmPrompt(sectionKey, sectionTitle, currentContent, indexData, level);
    const response = await client.answer(prompt, {
    //   temperature: 0.5,
    //   max_tokens: 4000,
      response_format: { "type": "json_object" }
    });
    
    // Parse JSON response
    let contentText = '';
    
    try {
      const parsedResponse = JSON.parse(response);
      // Extract the content from the JSON response
      if (parsedResponse && typeof parsedResponse === 'object') {
        // Use the first property of the object, usually 'content'
        const contentKey = Object.keys(parsedResponse)[0];
        if (contentKey && parsedResponse[contentKey]) {
          contentText = parsedResponse[contentKey];
        } else {
          outputChannel.appendLine(`Warning: JSON response doesn't contain expected content property for section ${sectionTitle}`);
          contentText = response;
        }
      } else {
        outputChannel.appendLine(`Warning: Parsed response is not an object for section ${sectionTitle}`);
        contentText = response;
      }
    } catch (error) {
      outputChannel.appendLine(`Warning: JSON parsing failed for section ${sectionTitle}: ${error.message}`);
      contentText = response;
    }
    
    const initialContent = contentText.trim();
    
    // Update section with initialContent and update README file
    generatedSections[sectionKey] = initialContent;
    outputChannel.appendLine(`Updating README.md with initial content for section: ${sectionTitle}`);
    await updateReadmeFile();
    
    let finalContent;
    if (sectionKey === 'project-title') {
        finalContent = initialContent;
    } else {
        // Deep dive to improve the content iteratively
        finalContent = await deepenSectionContent(
            sectionKey,
            sectionTitle,
            initialContent,
            indexData,
            projectPath,
            client,
            options.maxIterations || 3,
            generatedSections,
            originalSections,
            sectionOrder
        );
    }
    
    // Update section with final content
    generatedSections[sectionKey] = finalContent;
    
    // Don't update the file here, as it was already updated in the last iteration of deepenSectionContent
    // Only log completion information
    outputChannel.appendLine(`Completed generation for section: ${sectionTitle}`);
  }
  
  // Assemble the final README
  const finalReadmeContent = assembleReadme(generatedSections, originalSections, sectionOrder);
  
  return finalReadmeContent;
}

module.exports = {
  parseReadmeIntoSections,
  collectProjectIndexData,
  createLlmPrompt,
  deepenSectionContent,
  assembleReadme,
  generateProjectReadme,
  getSectionPromptInstruction
}; 