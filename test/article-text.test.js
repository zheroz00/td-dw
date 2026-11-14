import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.js';

const TDDW = await loadContentScript('content/article/article-text.js');

// --- cleanArticleText ----------------------------------------------------

test('cleanArticleText: collapses runs of spaces and tabs within a line', () => {
  assert.equal(TDDW.cleanArticleText('a  \t b  c'), 'a b c');
});

test('cleanArticleText: trims each line and drops whitespace-only lines to blanks', () => {
  assert.equal(TDDW.cleanArticleText('  one  \n   \n  two  '), 'one\n\ntwo');
});

test('cleanArticleText: collapses 3+ newlines to one paragraph break', () => {
  assert.equal(TDDW.cleanArticleText('one\n\n\n\n\ntwo\nthree'), 'one\n\ntwo\nthree');
});

test('cleanArticleText: normalizes CRLF and trims the whole text', () => {
  assert.equal(TDDW.cleanArticleText('\r\n\r\none\r\ntwo\r\n\r\n'), 'one\ntwo');
});

test('cleanArticleText: tolerates empty and nullish input', () => {
  assert.equal(TDDW.cleanArticleText(''), '');
  assert.equal(TDDW.cleanArticleText(null), '');
});

// --- capArticleText ------------------------------------------------------

test('capArticleText: under budget is returned unchanged', () => {
  const text = 'Short article.\n\nTwo paragraphs.';
  assert.deepEqual(TDDW.capArticleText(text, 1000), { text, truncated: false });
});

test('capArticleText: exactly at budget is not truncated', () => {
  const text = 'abcde fghij';
  assert.deepEqual(TDDW.capArticleText(text, text.length), { text, truncated: false });
});

test('capArticleText: over budget keeps the head and stays within maxChars', () => {
  const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const out = TDDW.capArticleText(text, 500);
  assert.equal(out.truncated, true);
  assert.ok(out.text.length <= 500);
  assert.ok(text.startsWith(out.text));
});

test('capArticleText: cuts at a paragraph break when one sits in the last 20% of the budget', () => {
  const p1 = 'a'.repeat(40);
  const p2 = 'b '.repeat(5).trim(); // 9 chars
  const tail = 'c '.repeat(100);
  const text = `${p1}\n\n${p2}\n\n${tail}`;
  // Budget 60: the break after p2 is at index 51, inside the last 20% (48..60).
  const out = TDDW.capArticleText(text, 60);
  assert.equal(out.text, `${p1}\n\n${p2}`);
  assert.equal(out.truncated, true);
});

test('capArticleText: prefers a late sentence end over an early paragraph break', () => {
  const text = `${'x'.repeat(10)}\n\nSecond paragraph runs on. And on and on until it ends here. Then keeps going and going and going`;
  const out = TDDW.capArticleText(text, 80);
  assert.equal(out.truncated, true);
  assert.ok(out.text.length <= 80);
  assert.match(out.text, /[.!?]$/);
  assert.ok(out.text.length > 50, 'should not fall back to the early paragraph break');
});

test('capArticleText: never cuts mid-word when there is no sentence end', () => {
  const text = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(30).trim();
  for (const max of [37, 100, 101, 250]) {
    const out = TDDW.capArticleText(text, max);
    assert.equal(out.truncated, true);
    assert.ok(out.text.length <= max);
    assert.ok(text.startsWith(out.text));
    assert.match(text[out.text.length], /\s/, `cut at ${max} landed mid-word`);
  }
});

test('capArticleText: a single unbroken run is hard-cut at the budget', () => {
  const out = TDDW.capArticleText('z'.repeat(100), 30);
  assert.equal(out.text.length, 30);
  assert.equal(out.truncated, true);
});

// --- readingMinutes ------------------------------------------------------

test('readingMinutes: never less than 1', () => {
  assert.equal(TDDW.readingMinutes(''), 1);
  assert.equal(TDDW.readingMinutes('just a few words'), 1);
});

test('readingMinutes: about 230 words per minute, rounded', () => {
  assert.equal(TDDW.readingMinutes('word '.repeat(230)), 1);
  assert.equal(TDDW.readingMinutes('word '.repeat(2300)), 10);
  assert.equal(TDDW.readingMinutes('word '.repeat(1000)), 4); // 4.35 rounds down
  assert.equal(TDDW.readingMinutes('word '.repeat(1100)), 5); // 4.78 rounds up
});
