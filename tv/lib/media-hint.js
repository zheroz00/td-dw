// What the Android TV app saw playing, as sent in the POST /api/recap body:
//   { nowPlaying: { app, title?, artist?, positionMs, durationMs? } }
//   { mediaAccess: false }   (the app has no notification access)
// An empty body is still fine: it means a plain Jellyfin recap.

export const MAX_TEXT_CHARS = 500;
const APP_ID = /^[A-Za-z0-9._]{1,200}$/;

// Bad input from the client; http-app answers it with a 400.
export class MediaHintError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaHintError';
  }
}

function optionalText(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new MediaHintError(`nowPlaying.${name} must be a string.`);
  if (value.length > MAX_TEXT_CHARS) {
    throw new MediaHintError(`nowPlaying.${name} must be at most ${MAX_TEXT_CHARS} characters.`);
  }
  return value.trim() || null;
}

function parseNowPlaying(raw) {
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MediaHintError('nowPlaying must be an object.');
  }
  if (typeof raw.app !== 'string' || !APP_ID.test(raw.app)) {
    throw new MediaHintError('nowPlaying.app must be an Android package name.');
  }
  if (typeof raw.positionMs !== 'number' || !Number.isFinite(raw.positionMs) || raw.positionMs < 0) {
    throw new MediaHintError('nowPlaying.positionMs must be a number of milliseconds, 0 or more.');
  }
  const { durationMs } = raw;
  if (durationMs !== undefined && durationMs !== null) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new MediaHintError('nowPlaying.durationMs must be a number of milliseconds above 0.');
    }
  }
  return {
    app: raw.app,
    title: optionalText(raw.title, 'title'),
    artist: optionalText(raw.artist, 'artist'),
    positionMs: raw.positionMs,
    durationMs: durationMs ?? null
  };
}

// Returns null when the body carries no hint, else { nowPlaying, mediaAccess }
// with null for whichever field was absent. Throws MediaHintError on bad input.
export function parseMediaHint(body) {
  const rawNowPlaying = body?.nowPlaying ?? null;
  const rawAccess = body?.mediaAccess ?? null;
  if (rawNowPlaying === null && rawAccess === null) return null;

  if (rawAccess !== null && typeof rawAccess !== 'boolean') {
    throw new MediaHintError('mediaAccess must be true or false.');
  }
  return {
    nowPlaying: rawNowPlaying === null ? null : parseNowPlaying(rawNowPlaying),
    mediaAccess: rawAccess
  };
}
