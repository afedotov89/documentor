# Documentor

Documentor is a minimal VSCode plugin designed to automatically generate documentation for the selected file or directory with

## Key Features

- Generates documentation for any selected file or directory in VSCode.
- Integrates seamlessly with the Explorer context menu.
- Quick and straightforward usage with minimal setup.

## How to Use

1. Open your project folder in VSCode.
2. Press F5 to launch a new instance of VSCode with the extension enabled.
3. In the Explorer, right-click on any file or folder and select "Document Code". The generated documentation will be displayed promptly.

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