import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.js';

const TDDW = await loadContentScript('content/adapters/transcript-cap.js');

function makeLines(count) {
  // Fixed-width lines so char budgets translate predictably to line counts.
  return Array.from({ length: count }, (_, i) => `line ${String(i).padStart(4, '0')}`);
}

test('under budget: returns the text unchanged and truncated: false', () => {
  const lines = makeLines(10);
  const maxChars = lines.join('\n').length; // exactly fits
  const result = TDDW.capTranscript(lines, maxChars);
  assert.equal(result.truncated, false);
  assert.equal(result.text, lines.join('\n'));
});

test('over budget: truncated true, fits the budget, no line is cut, last line always present', () => {
  const lines = makeLines(1000);
  const maxChars = 3300; // roughly 300 lines' worth at 9 chars + newline each
  const result = TDDW.capTranscript(lines, maxChars);

  assert.equal(result.truncated, true);
  assert.ok(result.text.length <= maxChars, `text length ${result.text.length} should be <= ${maxChars}`);

  const kept = result.text.split('\n');
  const lineSet = new Set(lines);
  for (const line of kept) {
    assert.ok(lineSet.has(line), `kept line "${line}" must be one of the original input lines`);
  }
  assert.equal(kept[kept.length - 1], lines[lines.length - 1], 'the last input line must always survive');
});

test('over budget: the recent window (last 25% of input) is denser than the early section', () => {
  const lines = makeLines(1000);
  const maxChars = 3300;
  const result = TDDW.capTranscript(lines, maxChars);
  const kept = result.text.split('\n');

  const recentThreshold = lines.length * 0.75; // index >= this is the "recent 25%"
  const indexOf = (line) => lines.indexOf(line);
  const fromRecentWindow = kept.filter((line) => indexOf(line) >= recentThreshold).length;
  const recentShare = fromRecentWindow / kept.length;

  // The recent window is only 25% of the input by count, but should dominate
  // the kept lines since it's sampled densely while the early 75% is sparse.
  assert.ok(recentShare > 0.25, `expected recent-window share > 0.25, got ${recentShare}`);
});

test('single huge line: still returns that one line even though it exceeds the budget', () => {
  const hugeLine = 'x'.repeat(1000);
  const result = TDDW.capTranscript([hugeLine], 100);
  assert.equal(result.truncated, true);
  assert.equal(result.text, hugeLine);
});
