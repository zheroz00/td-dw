import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHybridMessages } from '../background/providers/prompts.js';
import { pickProvider } from '../background/providers/index.js';

const partial = {
  service: 'Netflix',
  title: 'Some Show',
  episodeInfo: 'S2:E4 The One',
  currentTimeSeconds: 1500,
  durationSeconds: 2700,
  transcript: { text: '[12:30] hello\n[24:59] there', partial: true, coverageStartSeconds: 750, truncated: false }
};

test('buildHybridMessages states the covered window and puts the subtitles in the user turn', () => {
  const [system, user] = buildHybridMessages(partial, { summaryLength: 'medium' });
  assert.match(system.content, /covering ONLY 12:30 to 25:00/);
  assert.match(system.content, /before 12:30 from your own knowledge/);
  assert.match(system.content, /NO_KNOWLEDGE/);
  assert.doesNotMatch(system.content, /evenly sampled/);
  assert.match(user.content, /12:30 to 25:00/);
  assert.ok(user.content.includes('[24:59] there'));
});

test('buildHybridMessages mentions sampling only when truncated', () => {
  const state = { ...partial, transcript: { ...partial.transcript, truncated: true } };
  const [system] = buildHybridMessages(state, {});
  assert.match(system.content, /evenly sampled/);
});

test('pickProvider routes partial transcripts to hybrid, full ones to transcript, none to knowledge', () => {
  const auto = { recapProvider: 'auto' };
  assert.equal(pickProvider(partial, auto).name, 'hybrid');
  const full = { ...partial, transcript: { text: 'x', partial: false } };
  assert.equal(pickProvider(full, auto).name, 'transcript');
  assert.equal(pickProvider({ ...partial, transcript: null }, auto).name, 'knowledge');
});

test('pickProvider honours forced sources, except a partial transcript can only be hybrid', () => {
  assert.equal(pickProvider(partial, { recapProvider: 'knowledge' }).name, 'knowledge');
  assert.equal(pickProvider(partial, { recapProvider: 'transcript' }).name, 'hybrid');
  const full = { ...partial, transcript: { text: 'x' } };
  assert.equal(pickProvider(full, { recapProvider: 'transcript' }).name, 'transcript');
  assert.equal(pickProvider({ ...partial, transcript: null }, { recapProvider: 'transcript' }).name, 'transcript');
});
