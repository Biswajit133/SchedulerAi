const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIProvider = require('./AIProvider');

class GeminiProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for GeminiProvider');
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  async generate(prompt) {
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

module.exports = GeminiProvider;
