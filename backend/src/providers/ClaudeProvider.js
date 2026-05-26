const Anthropic = require('@anthropic-ai/sdk');
const AIProvider = require('./AIProvider');

class ClaudeProvider extends AIProvider {
  constructor() {
    super();
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY is required for ClaudeProvider');
    }
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  }

  async generate(prompt) {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0]?.text || '';
  }
}

module.exports = ClaudeProvider;
