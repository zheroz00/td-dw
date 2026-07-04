import { knowledgeProvider } from './knowledge-provider.js';
import { transcriptProvider } from './transcript-provider.js';

const providers = {
  knowledge: knowledgeProvider,
  transcript: transcriptProvider
};

// 'auto' (the default): use the real transcript when the site adapter managed
// to supply one, otherwise fall back to the model's own knowledge (Netflix,
// captionless videos).
export function pickProvider(videoState, config) {
  const name = config.recapProvider;
  if (name && name !== 'auto' && providers[name]) return providers[name];
  return videoState?.transcript?.text ? providers.transcript : providers.knowledge;
}
