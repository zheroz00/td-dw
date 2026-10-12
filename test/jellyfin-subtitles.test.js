import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.js';

const TDDW = await loadContentScript('content/adapters/jellyfin-subtitles.js');

const VTT = [
  'WEBVTT',
  '',
  '1',
  '00:00:01.000 --> 00:00:04.000',
  'Hello <i>there</i>, <c.speaker>friend</c>.',
  '',
  '2',
  '00:00:05.500 --> 00:00:08.000',
  'Second line of dialogue.',
  '',
  '3',
  '01:02:03.000 --> 01:02:06.000',
  'An hour-plus-in cue.',
  '',
  '4',
  '00:20:00.000 --> 00:20:05.000',
  'This is after the cutoff and must be dropped.'
].join('\n');

test('parses cues, strips tags, and prefixes [m:ss] timestamps', () => {
  // 10 minutes: keeps cues 1-2 (0:01, 0:05); cue 3 is over an hour in and
  // cue 4 is at 20 minutes, so both land past this cutoff.
  const cutoffMs = 10 * 60 * 1000;
  const result = TDDW.parseJellyfinSubtitles(VTT, cutoffMs, 'eng');
  assert.ok(result, 'expected a parsed result');
  assert.equal(result.language, 'eng');
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0], '[0:01] Hello there, friend.');
  assert.equal(result.lines[1], '[0:05] Second line of dialogue.');
});

test('formats an h:mm:ss cue correctly', () => {
  const cutoffMs = 10 * 60 * 60 * 1000; // 10 hours: comfortably past every cue in this fixture
  const result = TDDW.parseJellyfinSubtitles(VTT, cutoffMs, 'eng');
  const hourLine = result.lines.find((l) => l.includes('hour-plus-in'));
  assert.equal(hourLine, '[1:02:03] An hour-plus-in cue.');
});

test('drops cues after the cutoff', () => {
  const cutoffMs = 10 * 60 * 1000;
  const result = TDDW.parseJellyfinSubtitles(VTT, cutoffMs, 'eng');
  assert.ok(!result.lines.some((l) => l.includes('after the cutoff')));
});

test('handles CRLF line endings', () => {
  const crlf = VTT.replace(/\n/g, '\r\n');
  const cutoffMs = 10 * 60 * 1000;
  const result = TDDW.parseJellyfinSubtitles(crlf, cutoffMs, 'eng');
  assert.ok(result);
  assert.equal(result.lines[0], '[0:01] Hello there, friend.');
});

test('defaults language to "unknown" when none is supplied', () => {
  const result = TDDW.parseJellyfinSubtitles(VTT, 60000, undefined);
  assert.equal(result.language, 'unknown');
});

test('returns null for non-VTT input', () => {
  assert.equal(TDDW.parseJellyfinSubtitles('not a subtitle file at all', 60000, 'eng'), null);
  assert.equal(TDDW.parseJellyfinSubtitles('', 60000, 'eng'), null);
  assert.equal(TDDW.parseJellyfinSubtitles(null, 60000, 'eng'), null);
});
