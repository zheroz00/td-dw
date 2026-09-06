import { knowledgeProvider } from './knowledge-provider.js';
import { transcriptProvider } from './transcript-provider.js';
import { hybridProvider } from './hybrid-provider.js';

const providers = {
  knowledge: knowledgeProvider,
  transcript: transcriptProvider,
  hybrid: hybridProvider
};

// 'auto' (the default): a full transcript (YouTube captions, Jellyfin
// subtitles) goes to the transcript engine; a partial one captured live off a
// DRM player goes to the hybrid engine; nothing at all means the model's own
// knowledge. A forced 'transcript' still routes a partial transcript to hybrid,
// since that is the only grounded engine that can use it.
export function pickProvider(videoState, config) {
  const transcript = videoState?.transcript;
  const hasText = !!transcript?.text;
  const name = config.recapProvider;

  if (name === 'knowledge') return providers.knowledge;
  if (name === 'transcript' && !(hasText && transcript.partial)) return providers.transcript;
  if (!hasText) return providers.knowledge;
  return transcript.partial ? providers.hybrid : providers.transcript;
}
