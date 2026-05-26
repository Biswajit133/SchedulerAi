const Groq = require('groq-sdk');
const AIProvider = require('./AIProvider');

class GroqProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for GroqProvider');
    }
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  async generate(prompt) {
    const completion = await this.client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
      temperature: 0.1,
      max_tokens: 2048,
    });
    return completion.choices[0]?.message?.content || '';
  }
}

module.exports = GroqProvider;
