const { OpenAI } = require('openai');

// Function for execution delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ChatGPTClient {
  /**
   * @param {string} apiKey - API key for authentication with OpenAI API.
   * @param {string} systemText - System message text, empty string by default.
   * @param {string} model - Model name
   * @param {object} defaultOptions - Additional parameters for API calls.
   */
  constructor(apiKey, model, systemText = '', defaultOptions = {}) {
    this.apiKey = apiKey;
    this.systemText = systemText;
    this.defaultOptions = {
      model,
       ...defaultOptions
    };
    this.messages = [];
    this.logger = console; // Using console for logging
    
    const configuration = {
      apiKey: this.apiKey,
    };
    this.openai = new OpenAI(configuration);

    this.clear();
  }

  /**
   * Clears message history and initializes system message.
   */
  clear() {
    this.messages = [
      { role: 'system', content: this.systemText }
    ];
  }

  /**
   * Sends a request to OpenAI API and returns the response.
   * @param {string} prompt - User question.
   * @param {object} options - Additional request parameters.
   * @returns {Promise<string>} - Response from OpenAI.
   */
  async answer(prompt, options = {}) {
    this.messages.push({ role: 'user', content: prompt });
    const modelOptions = {
      ...this.defaultOptions,
      messages: this.messages,
      ...options
    };
    const responseText = await this._getCompletion(modelOptions);
    return responseText;
  }

  /**
   * Helper method for API calls with retry attempts.
   * @param {object} modelOptions - Request parameters.
   * @param {number} maxRetries - Maximum number of retry attempts (default 3).
   * @param {number} retryDelay - Delay between attempts in milliseconds (default 2000 ms).
   * @returns {Promise<string>} - Response from OpenAI.
   */
  async _getCompletion(modelOptions, maxRetries = 3, retryDelay = 2000) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        this.logger.debug(`Calling OpenAI API with parameters: ${JSON.stringify(modelOptions)}`);
        const response = await this.openai.chat.completions.create(modelOptions, {timeout: 60000});
        const message = response.choices[0].message;
        this.messages.push(message);
        return message.content;
      } catch (error) {
        // If timeout error or server error, retry request
        if (error.code === 'ETIMEDOUT' || (error.response && error.response.status >= 500)) {
          this.logger.error(`Error: ${error}. Retrying... (Attempt ${attempt + 1}/${maxRetries})`);
          attempt++;
          await sleep(retryDelay);
        } else {
          throw error;
        }
      }
    }
    throw new Error('Maximum number of retry attempts for OpenAI API request exceeded');
  }
}

module.exports = ChatGPTClient; 