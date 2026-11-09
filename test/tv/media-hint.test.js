import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaHint, MediaHintError } from '../../tv/lib/media-hint.js';

const NOW = { app: 'com.google.android.youtube.tv', title: 'A video', artist: 'A channel', positionMs: 61000, durationMs: 600000 };
const bad = (body, pattern) => assert.throws(() => parseMediaHint(body), (err) => err instanceof MediaHintError && pattern.test(err.message));

test('parseMediaHint: no hint fields means null', () => {
  assert.equal(parseMediaHint({}), null);
  assert.equal(parseMediaHint({ other: 1 }), null);
  assert.equal(parseMediaHint({ nowPlaying: null }), null);
});

test('parseMediaHint: a full nowPlaying passes through', () => {
  assert.deepEqual(parseMediaHint({ nowPlaying: NOW }), { nowPlaying: NOW, mediaAccess: null });
});

test('parseMediaHint: title, artist and duration are optional', () => {
  const hint = parseMediaHint({ nowPlaying: { app: 'com.netflix.ninja', positionMs: 0 } });
  assert.deepEqual(hint.nowPlaying, { app: 'com.netflix.ninja', title: null, artist: null, positionMs: 0, durationMs: null });
});

test('parseMediaHint: blank title and artist count as absent, others are trimmed', () => {
  const { nowPlaying } = parseMediaHint({ nowPlaying: { ...NOW, title: '   ', artist: '  Johnny  ' } });
  assert.equal(nowPlaying.title, null);
  assert.equal(nowPlaying.artist, 'Johnny');
});

test('parseMediaHint: mediaAccess false on its own', () => {
  assert.deepEqual(parseMediaHint({ mediaAccess: false }), { nowPlaying: null, mediaAccess: false });
  bad({ mediaAccess: 'no' }, /mediaAccess/);
  bad({ mediaAccess: 0 }, /mediaAccess/);
});

test('parseMediaHint: rejects a bad app', () => {
  for (const app of [undefined, 5, '', 'has space', 'semi;colon', 'a/b', 'x'.repeat(201)]) {
    bad({ nowPlaying: { ...NOW, app } }, /app/);
  }
  assert.ok(parseMediaHint({ nowPlaying: { ...NOW, app: 'x'.repeat(200) } }));
});

test('parseMediaHint: rejects a bad position', () => {
  for (const positionMs of [undefined, null, '5', -1, NaN, Infinity]) {
    bad({ nowPlaying: { ...NOW, positionMs } }, /positionMs/);
  }
});

test('parseMediaHint: rejects a bad duration', () => {
  for (const durationMs of ['5', 0, -5, NaN]) {
    bad({ nowPlaying: { ...NOW, durationMs } }, /durationMs/);
  }
});

test('parseMediaHint: rejects long or non-string text', () => {
  bad({ nowPlaying: { ...NOW, title: 'x'.repeat(501) } }, /title/);
  bad({ nowPlaying: { ...NOW, artist: 'x'.repeat(501) } }, /artist/);
  bad({ nowPlaying: { ...NOW, title: 42 } }, /title/);
  bad({ nowPlaying: { ...NOW, artist: {} } }, /artist/);
  assert.ok(parseMediaHint({ nowPlaying: { ...NOW, title: 'x'.repeat(500) } }));
});

test('parseMediaHint: nowPlaying must be an object', () => {
  bad({ nowPlaying: 'youtube' }, /nowPlaying/);
  bad({ nowPlaying: [NOW] }, /nowPlaying/);
});
