import { chatCompletion } from '../llm-client.js';
import { buildHybridMessages, isNoKnowledge, stripNoKnowledge } from './prompts.js';

// v3 provider: the DRM streaming sites (Netflix, Prime Video, Disney+) never
// hand over a subtitle file, but caption-capture.js collects the cues shown on
// screen since the tab loaded. That partial transcript can't carry a recap on
// its own (it starts wherever the viewer turned the tab on), so the model
// recaps from its own knowledge and uses the captured dialogue to pin down
// exactly where the viewer is in the story. Shares the provider result shape
// (see knowledge-provider.js); source 'hybrid' gets its own badge.

export const hybridProvider = {
  name: 'hybrid',

  async getRecap(videoState, config) {
    if (!videoState.transcript?.text) {
      return { ok: false, error: 'No captured captions for this video.' };
    }
    try {
      const text = await chatCompletion(config, buildHybridMessages(videoState, config), {
        temperature: 0,
        effort: 'medium'
      });
      if (isNoKnowledge(text)) {
        return {
          ok: true,
          known: false,
          message: stripNoKnowledge(text) ||
            `The model doesn't know "${videoState.title}" well enough for a reliable recap, even with the captions it was shown.`
        };
      }
      return { ok: true, known: true, recapText: text, source: 'hybrid' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
};
