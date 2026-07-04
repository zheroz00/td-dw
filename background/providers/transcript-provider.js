import { chatCompletion } from '../llm-client.js';
import { buildTranscriptMessages } from './prompts.js';

// v2 provider: summarizes the actual caption track up to the timestamp.
// Works on any video with captions, no model memory required.
// Shares the provider result shape (see knowledge-provider.js).

export const transcriptProvider = {
  name: 'transcript',

  async getRecap(videoState, config) {
    if (!videoState.transcript?.text) {
      return { ok: false, error: 'No transcript available for this video.' };
    }
    try {
      const text = await chatCompletion(config, buildTranscriptMessages(videoState, config));
      // 'transcript' = grounded in the actual caption/subtitle text, not the
      // model's memory. The overlay badges this as trustworthy.
      return { ok: true, known: true, recapText: text, source: 'transcript' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
};
