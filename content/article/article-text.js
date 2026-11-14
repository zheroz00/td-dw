// Pure text helpers for article mode: no DOM, no chrome.* APIs, so they load
// under node:test the same way transcript-cap.js does.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  const WORDS_PER_MINUTE = 230;
  // A paragraph break only counts as a good cut if it keeps at least this much
  // of the budget; otherwise a break near the top would throw most of it away.
  const MIN_KEPT_FRACTION = 0.8;

  // Readability's textContent is full of layout whitespace (indentation,
  // runs of blank lines). Collapse it so it doesn't eat the budget or confuse
  // the paragraph-break search below.
  globalThis.TDDW.cleanArticleText = function (text) {
    return String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // Articles front-load what matters, so an over-budget one keeps its HEAD
  // (unlike transcripts, where recency wins). The cut lands on a paragraph
  // break when one is close to the budget, else a sentence end, else any
  // whitespace, so the model never sees half a word.
  globalThis.TDDW.capArticleText = function (text, maxChars) {
    if (text.length <= maxChars) return { text, truncated: false };

    // One char past the budget: lets a boundary that sits exactly at maxChars
    // count (the slice before it is then a clean cut, not a mid-word one).
    const head = text.slice(0, maxChars + 1);
    const finish = (end) => ({ text: text.slice(0, end).trimEnd(), truncated: true });

    const paragraph = head.lastIndexOf('\n\n');
    if (paragraph >= maxChars * MIN_KEPT_FRACTION) return finish(paragraph);

    let sentenceEnd = -1;
    for (const m of head.matchAll(/[.!?]["'”’)\]]*(?=\s)/g)) sentenceEnd = m.index + m[0].length;
    if (sentenceEnd > 0) return finish(sentenceEnd);

    const space = head.search(/\s\S*$/);
    if (space > 0) return finish(space);

    return finish(maxChars); // one unbroken run of text: nothing better to cut on
  };

  globalThis.TDDW.readingMinutes = function (text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  };
})();
