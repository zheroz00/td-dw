import { chatCompletion } from '../llm-client.js';
import { buildRecapMessages, isNoKnowledge, stripNoKnowledge } from './prompts.js';

// v1 provider: relies on the model's own knowledge of the title.
// Result shape (shared by all providers):
//   { ok: true,  known: true,  recapText: string, source: 'knowledge'|'transcript' }
//   { ok: true,  known: false, message: string }   // model doesn't know the title
//   { ok: false, error: string }
// `source` tells the overlay where the recap came from so it can flag how much
// to trust it: 'transcript' = grounded in real captions, 'knowledge' = recalled
// from the model's training (could be imperfect).

export const knowledgeProvider = {
  name: 'knowledge',

  async getRecap(videoState, config) {
    if (!config.apiKey && (config.baseUrl || '').includes('openrouter.ai')) {
      return { ok: false, error: 'No API key configured. Open settings to add your OpenRouter key.' };
    }
    try {
      const text = await chatCompletion(config, buildRecapMessages(videoState, config), { temperature: 0, effort: 'medium' });
      if (isNoKnowledge(text)) {
        const explanation = stripNoKnowledge(text);
        return {
          ok: true,
          known: false,
          message: explanation ||
            `The model doesn't know "${videoState.title}" well enough for a reliable recap. Try a stronger model in settings, or a title with subtitles.`
        };
      }
      return { ok: true, known: true, recapText: text, source: 'knowledge' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
};
