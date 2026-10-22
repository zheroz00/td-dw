import { chatCompletion } from '../llm-client.js';
import { buildHybridMessages, isNoKnowledge } from './prompts.js';
import { transcriptProvider } from './transcript-provider.js';

// v3 provider: the DRM streaming sites (Netflix, Prime Video, Disney+) never
// hand over a subtitle file, but caption-capture.js collects the cues shown on
// screen since the tab loaded. That partial transcript can't carry a recap on
// its own (it starts wherever the viewer turned the tab on), so the model
// recaps from its own knowledge and uses the captured dialogue to pin down
// exactly where the viewer is in the story. Shares the provider result shape
// (see knowledge-provider.js); source 'hybrid' gets its own badge.
//
// When the model doesn't recognise the title, the captured dialogue is still
// real: fall back to recapping just that window with the transcript engine
// (source 'captions'), so an unknown show still gets a grounded partial recap.

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
        return transcriptProvider.getRecap(videoState, config);
      }
      return { ok: true, known: true, recapText: text, source: 'hybrid' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
};
