class AIProvider {
  async generate(prompt) {
    throw new Error(`generate() must be implemented by ${this.constructor.name}`);
  }

  parseJSON(text) {
    const cleaned = text
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/gi, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Failed to parse AI response as JSON');
    }
  }
}

module.exports = AIProvider;
