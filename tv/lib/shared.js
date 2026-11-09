// Bridge to the extension's content-script helpers. Those files are plain
// browser scripts that hang their functions on globalThis.TDDW (content scripts
// can't use ES modules), so the service imports them for that side effect, the
// same way test/helpers.js does, and re-exports what it needs. One copy of the
// subtitle parser and transcript capping serves the browser and the TV.
import '../../content/adapters/transcript-cap.js';
import '../../content/adapters/jellyfin-subtitles.js';
import '../../content/adapters/youtube-transcript.js';

export const {
  parseJellyfinSubtitles,
  pickJellyfinSubtitleStream,
  capTranscript,
  TRANSCRIPT_BUDGET_CHARS,
  fetchYouTubeTranscript
} = globalThis.TDDW;
