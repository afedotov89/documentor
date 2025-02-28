/**
 * Default settings for the Documentor extension
 */

const defaultDocumentationFormats = {
  python: "reStructuredText (reST)",
  javascript: "JSDoc",
  java: "Javadoc",
  cpp: "Doxygen"
};

/**
 * Gets available documentation formats for a specific language
 * @param {string} language - Programming language code
 * @returns {Object} - Object with format options and default format
 */
function getLanguageFormats(language) {
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

  return formats[language] || { options: ["Standard comments"], default: "Standard comments" };
}

/**
 * Gets the default settings with documentation formats
 * @returns {Object} - Default settings object
 */
function getDefaultSettings() {
  return {
    docFormats: defaultDocumentationFormats
  };
}

module.exports = {
  defaultDocumentationFormats,
  getLanguageFormats,
  getDefaultSettings
}; 