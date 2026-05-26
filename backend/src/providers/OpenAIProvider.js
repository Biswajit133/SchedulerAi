const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

class OpenAIProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for OpenAIProvider');
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
  }

  async generate(prompt) {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });
    return completion.choices[0]?.message?.content || '';
  }
}

module.exports = OpenAIProvider;
