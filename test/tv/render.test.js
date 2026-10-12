import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBold, parseRecap, formatTime } from '../../tv/public/render.js';

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

test('splitBold: plain text is one run', () => {
  assert.deepEqual(splitBold('plain'), [{ text: 'plain', bold: false }]);
});

test('formatTime: m:ss, h:mm:ss and unknown', () => {
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(NaN), '?');
  assert.equal(formatTime(null), '?');
});
