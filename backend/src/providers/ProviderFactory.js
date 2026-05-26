const GroqProvider = require('./GroqProvider');
const OpenAIProvider = require('./OpenAIProvider');
const ClaudeProvider = require('./ClaudeProvider');
const GeminiProvider = require('./GeminiProvider');

const PROVIDERS = {
  groq: GroqProvider,
  openai: OpenAIProvider,
  claude: ClaudeProvider,
  gemini: GeminiProvider,
};

class ProviderFactory {
  static create() {
    const name = (process.env.AI_PROVIDER || 'groq').toLowerCase();
    const ProviderClass = PROVIDERS[name];
    if (!ProviderClass) {
      throw new Error(
        `Unknown AI provider: "${name}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`
      );
    }
    return new ProviderClass();
  }

  static supportedProviders() {
    return Object.keys(PROVIDERS);
  }
}

module.exports = ProviderFactory;
