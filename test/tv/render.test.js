import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitBold, parseRecap, formatTime, LIST_MARKER, TIME_CHIP } from '../../tv/public/render.js';
import { formatTime as promptsFormatTime } from '../../background/providers/prompts.js';

test('parseRecap: strips list markers', () => {
  const out = parseRecap('- one\n• two\n1. three\n2) four\n* five');
  assert.deepEqual(out.map((b) => b.runs[0].text), ['one', 'two', 'three', 'four', 'five']);
});

test('parseRecap: a line opening with **bold** keeps its bold', () => {
  assert.deepEqual(parseRecap('**Mark** wakes up')[0].runs, [
    { text: 'Mark', bold: true },
    { text: ' wakes up', bold: false }
  ]);
});

test('parseRecap: lifts a leading [m:ss] or [h:mm:ss] into a chip', () => {
  const [a, b, c] = parseRecap('- [12:34] Something.\n- [1:02:03] Later.\n- No time.');
  assert.equal(a.time, '12:34');
  assert.equal(a.runs[0].text, 'Something.');
  assert.equal(b.time, '1:02:03');
  assert.equal(c.time, null);
});

test('parseRecap: markup in model output stays plain text', () => {
  const [bullet] = parseRecap('- <img src=x onerror=alert(1)> **hi**');
  assert.deepEqual(bullet.runs, [
    { text: '<img src=x onerror=alert(1)> ', bold: false },
    { text: 'hi', bold: true }
  ]);
});

test('parseRecap: blank lines and empty input give nothing', () => {
  assert.equal(parseRecap('\n\n- one\n\n').length, 1);
  assert.deepEqual(parseRecap(null), []);
});

test('parseRecap: a chip with no text after it has no runs', () => {
  assert.deepEqual(parseRecap('- [0:05]'), [{ time: '0:05', runs: [] }]);
});

test('parseRecap: bold after a chip keeps both', () => {
  assert.deepEqual(parseRecap('- [1:02] **x** y'), [
    { time: '1:02', runs: [{ text: 'x', bold: true }, { text: ' y', bold: false }] }
  ]);
});

test('splitBold: plain text is one run', () => {
  assert.deepEqual(splitBold('plain'), [{ text: 'plain', bold: false }]);
});

test('formatTime: m:ss, h:mm:ss and unknown', () => {
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(NaN), '?');
  assert.equal(formatTime(null), '?');
});

// render.js has to be a copy: a content script and a static page can't share
// modules. These tests are what stop the copies drifting apart.
test("formatTime matches the prompts' formatTime", () => {
  for (const seconds of [0, 59, 65, 3599, 3600, 3723]) {
    assert.equal(formatTime(seconds), promptsFormatTime(seconds), `at ${seconds}s`);
  }
});

test('the overlay still parses with the same regexes', async () => {
  const overlay = await readFile(new URL('../../content/ui/overlay.js', import.meta.url), 'utf8');
  const hint = 'the overlay parsing changed, so tv/public/render.js must change to match';
  assert.ok(overlay.includes(LIST_MARKER.source), `list marker regex missing from overlay.js: ${hint}`);
  assert.ok(overlay.includes(TIME_CHIP.source), `time chip regex missing from overlay.js: ${hint}`);
});
