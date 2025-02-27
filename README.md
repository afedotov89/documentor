# Documentor

Documentor is a minimal VSCode plugin designed to automatically generate documentation for the selected code files and directories.

## Key Features

- Generates documentation for any selected file or directory in VSCode.
- Exports documentation to files in different formats.
- Provides a modern, user-friendly interface for exporting documentation.
- Integrates seamlessly with the Explorer context menu.
- Quick and straightforward usage with minimal setup.
- Export documentation for the entire project through a status bar button.

## How to Use

1. **Generating Documentation**:
   - Right-click on any file or directory in the Explorer.
   - Select "Generate Documentation".
   - The generated documentation will be displayed in a new editor tab.

2. **Exporting Documentation**:
   - Right-click on any file or directory in the Explorer.
   - Select "Export Documentation (Advanced)".
   - In the dialog that opens, configure the export options:
     - Choose the type of documentation.
     - Set the path to save the documentation file.
   - Click "Export".

3. **Exporting Documentation for the Entire Project**:
   - Click the "Export Docs" button in the status bar (bottom of the screen).
   - In the dialog that opens, configure the export options for project documentation.
   - Click "Export".
   - The documentation will be created for all indexed files in the project.

## Documentation Export Options

- **Documentation Type**: Choose between README.md or a custom documentation file.
- **Filename**: Set a custom filename for your documentation.
- **Export Directory**: Browse or enter a custom directory path.
- **Preview**: Enable/disable preview before saving.

## Project Documentation

When exporting documentation for the entire project through the status bar button, a comprehensive document is created, including:

- Overall project information
- Statistics of indexed files
- Grouped list of files with documentation by directories

Exporting project documentation is only available if the project contains indexed files.

## Installation & Building

Follow these steps to install and set up the plugin:

1. Install dependencies:

   `npm install`

2. (Optional) Compile the extension if necessary:

   // No compilation needed by default

3. Package the plugin into a VSIX package:

   `vsce package`

4. Install the plugin using the generated VSIX file:

   `code --install-extension <filename>.vsix`

5. Restart VSCode after installation.

Note: If you don't have the vsce tool installed, you can install it with:

   `npm install -g vsce`

## Running Tests

To ensure everything works correctly, run the tests using these steps:

1. Install dependencies if you haven't already:

   `npm install`

2. Run all tests:

   `npm test`

3. To run a specific test file, use:

   `mocha path/to/test_file.js`

For example, if the test file is located at `test/example.test.js`, execute:

   `mocha test/example.test.js`

If you encounter issues running tests, ensure that Mocha is installed globally:

   `npm install -g mocha` 