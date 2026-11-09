// Which recap path a request takes, from what the TV app says is playing.

const JELLYFIN_APP = 'org.jellyfin.androidtv';
const YOUTUBE_APP = 'com.google.android.youtube.tv';

const FRIENDLY_NAMES = {
  'com.netflix.ninja': 'Netflix',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.amazon.amazonvideo.livingroom.nvidia': 'Prime Video',
  'com.disney.disneyplus': 'Disney+'
};

export const UNKNOWN_APP_NAME = 'this app';

// No hint (phone, browser, older app) means the Jellyfin session, as before.
export function routeMedia(hint) {
  const app = hint?.nowPlaying?.app;
  if (!app || app === JELLYFIN_APP) return { kind: 'jellyfin' };
  if (app === YOUTUBE_APP) return { kind: 'youtube' };
  const name = Object.hasOwn(FRIENDLY_NAMES, app) ? FRIENDLY_NAMES[app] : UNKNOWN_APP_NAME;
  return { kind: 'unsupported', name };
}
