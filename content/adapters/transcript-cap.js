// Shared transcript budgeting. Both YouTube and Jellyfin adapters produce the
// same shape (an array of "[m:ss] text" lines) and need the same recency-biased
// sampling when a title's transcript blows past the configured budget, so the
// logic lives here once instead of two identical copies.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  // Mirrors background/config.js TRANSCRIPT_BUDGET_CHARS. Content scripts can't
  // import ES modules, so this map is duplicated here. Keep the two in sync.
  const TRANSCRIPT_BUDGET_CHARS = { standard: 400000, local: 60000 };

  function lengthOf(lines) {
    return lines.length ? lines.join('\n').length : 0;
  }

  // Sample `lines` down to roughly fit `budgetChars`, spreading the kept lines
  // evenly across the range so the sample still covers the whole span instead
  // of just the start. Always keeps the last line of the slice (the newest
  // moment in it) even when the even-spacing pass would have skipped it.
  function sampleEvenly(lines, budgetChars) {
    if (lines.length <= 1 || lengthOf(lines) <= budgetChars) return lines;
    const keepRatio = budgetChars / lengthOf(lines);
    const keepIdx = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (Math.floor(i * keepRatio) !== Math.floor((i - 1) * keepRatio)) keepIdx.add(i);
    }
    keepIdx.add(lines.length - 1);
    return [...keepIdx].sort((a, b) => a - b).map((i) => lines[i]);
  }

  // If the transcript is too long, sample with a recency bias so the recap
  // still covers the whole span (start → now) while staying densest right
  // before "now", the part the user actually wants caught up on.
  globalThis.TDDW.capTranscript = function (lines, maxChars) {
    const text = lines.join('\n');
    if (text.length <= maxChars) return { text, truncated: false };

    // The last 25% of lines (by count) is the "recent window": kept dense,
    // sampled only if it alone can't fit the whole budget. The earlier 75% is
    // sampled evenly into whatever budget the recent window leaves behind.
    const recentCount = Math.max(1, Math.ceil(lines.length * 0.25));
    const recentStart = Math.max(0, lines.length - recentCount);
    const early = lines.slice(0, recentStart);
    let recent = lines.slice(recentStart);

    if (lengthOf(recent) > maxChars) {
      recent = sampleEvenly(recent, maxChars);
    }

    const remainingBudget = Math.max(0, maxChars - lengthOf(recent));
    const earlySampled = early.length && remainingBudget > 0 ? sampleEvenly(early, remainingBudget) : [];

    const sampled = [...earlySampled, ...recent];

    // Even sampling can still overshoot when line lengths vary. Trim whole
    // lines from the OLDEST end so the most recent events (closest to "now")
    // always survive and no line is cut mid-line (a naive slice(0, maxChars)
    // would drop the newest lines instead). Always keep at least one line.
    const kept = [];
    let total = 0;
    for (let i = sampled.length - 1; i >= 0; i--) {
      const len = sampled[i].length + 1; // +1 for the joining newline
      if (kept.length && total + len > maxChars) break;
      kept.unshift(sampled[i]);
      total += len;
    }

    console.warn(`[TD;DW] transcript truncated: kept ${kept.length} of ${lines.length} lines`);
    return { text: kept.join('\n'), truncated: true };
  };

  globalThis.TDDW.TRANSCRIPT_BUDGET_CHARS = TRANSCRIPT_BUDGET_CHARS;

  // Reads the configured budget from storage. Wrapped like getPauseOnOpen in
  // content/content.js: any failure (storage unavailable, bad shape) falls
  // back to the generous 'standard' budget rather than surprising someone with
  // a tiny local-model cap they never chose.
  globalThis.TDDW.getTranscriptBudget = async function () {
    try {
      const { catchMeUpConfig } = await chrome.storage.local.get('catchMeUpConfig');
      const key = catchMeUpConfig?.transcriptBudget;
      return TRANSCRIPT_BUDGET_CHARS[key] || TRANSCRIPT_BUDGET_CHARS.standard;
    } catch {
      return TRANSCRIPT_BUDGET_CHARS.standard;
    }
  };
})();
