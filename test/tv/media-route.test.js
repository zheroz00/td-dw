import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMedia } from '../../tv/lib/media-route.js';

const playing = (app) => ({ nowPlaying: { app, positionMs: 1000 }, mediaAccess: null });

test('routeMedia: no hint, no nowPlaying or the Jellyfin app is Jellyfin', () => {
  assert.deepEqual(routeMedia(null), { kind: 'jellyfin' });
  assert.deepEqual(routeMedia(undefined), { kind: 'jellyfin' });
  assert.deepEqual(routeMedia({ nowPlaying: null, mediaAccess: false }), { kind: 'jellyfin' });
  assert.deepEqual(routeMedia(playing('org.jellyfin.androidtv')), { kind: 'jellyfin' });
});

test('routeMedia: the YouTube TV app is YouTube', () => {
  assert.deepEqual(routeMedia(playing('com.google.android.youtube.tv')), { kind: 'youtube' });
});

test('routeMedia: known streaming apps are unsupported, with friendly names', () => {
  const names = {
    'com.netflix.ninja': 'Netflix',
    'com.amazon.amazonvideo.livingroom': 'Prime Video',
    'com.amazon.amazonvideo.livingroom.nvidia': 'Prime Video',
    'com.disney.disneyplus': 'Disney+'
  };
  for (const [app, name] of Object.entries(names)) {
    assert.deepEqual(routeMedia(playing(app)), { kind: 'unsupported', name }, app);
  }
});

test('routeMedia: anything else is "this app"', () => {
  assert.deepEqual(routeMedia(playing('com.example.player')), { kind: 'unsupported', name: 'this app' });
  // Names on Object.prototype are not apps.
  assert.deepEqual(routeMedia(playing('constructor')), { kind: 'unsupported', name: 'this app' });
});
