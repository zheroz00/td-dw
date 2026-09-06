import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.js';

// caption-capture.js only defines functions at load; the DOM-driven observer is
// started later by the adapters, so importing it under node is safe.
await loadContentScript('content/adapters/transcript-cap.js');
const TDDW = await loadContentScript('content/adapters/caption-capture.js');

const cues = [
  { streamT: 65, text: 'First line' },
  { streamT: 130, text: 'Second line' },
  { streamT: 400, text: 'Third line' }
];

test('cuesToTranscript keeps cues up to now, in order, with [m:ss] prefixes', () => {
  const out = TDDW.cuesToTranscript(cues, 200, 200, 10000);
  assert.equal(out.partial, true);
  assert.equal(out.truncated, false);
  assert.deepEqual(out.text.split('\n'), ['[1:05] First line', '[2:10] Second line']);
  assert.equal(out.coverageStartSeconds, 65);
  assert.equal(out.coverageEndSeconds, 130);
});

test('cuesToTranscript drops everything after a rewind point', () => {
  const out = TDDW.cuesToTranscript(cues, 100, 100, 10000);
  assert.deepEqual(out.text.split('\n'), ['[1:05] First line']);
});

test('cuesToTranscript returns null with no cues or none before now', () => {
  assert.equal(TDDW.cuesToTranscript([], 200, 200, 10000), null);
  assert.equal(TDDW.cuesToTranscript(cues, 30, 30, 10000), null);
  assert.equal(TDDW.cuesToTranscript(cues, NaN, 30, 10000), null);
});

test('cuesToTranscript subtracts the ad offset on ad-stitched players', () => {
  // Stream clock is 90s ahead of the real position (a 90s ad ran).
  const out = TDDW.cuesToTranscript(cues, 200, 290, 10000);
  // 400 - 90 = 310 > 200: excluded. 130 - 90 = 40, 65 - 90 < 0: dropped.
  assert.deepEqual(out.text.split('\n'), ['[0:40] Second line']);
});

test('cuesToTranscript applies the transcript budget', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ streamT: i * 2, text: `cue number ${i}` }));
  const out = TDDW.cuesToTranscript(many, 5000, 5000, 2000);
  assert.equal(out.truncated, true);
  assert.ok(out.text.length <= 2000);
  assert.ok(out.text.endsWith('cue number 499'));
});
