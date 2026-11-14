// Article mode orchestration: pull the readable text out of the current page,
// ask the service worker for a summary, render it in the shared overlay.
// Injected on demand (see ARTICLE_JS in background/service-worker.js), never as
// a static content script, so it only ever runs on a page the user clicked on.
// Mirrors content/content.js for the video flow; keep the two in step.
(() => {
  const CMU = globalThis.TDDW;
  // Injecting twice (shortcut, then icon) must not stack a second set of
  // handlers and listeners on the same overlay.
  if (CMU.articleModeLoaded) return;
  CMU.articleModeLoaded = true;
  console.log('[TD;DW] article mode loaded');

  // Below this the page is a landing page, a login wall or an app shell, not
  // something worth a summary.
  const MIN_ARTICLE_CHARS = 400;

  // Mirrors background/config.js TRANSCRIPT_BUDGET_CHARS (same limit as video
  // transcripts, set by the same option). Content scripts can't import ES
  // modules, so keep the two in sync.
  const TRANSCRIPT_BUDGET_CHARS = { standard: 400000, local: 60000 };

  const NOT_AN_ARTICLE =
    'This page doesn’t look like an article, so there’s nothing to summarize. TD;DW summarizes articles and recaps videos on supported sites.';

  // Reloading or updating the extension orphans the scripts already running in
  // open tabs; Chrome then rejects every message with "Extension context
  // invalidated".
  function extensionErrorMessage(err) {
    if (/context invalidated/i.test(err?.message || '')) {
      return 'TD;DW was reloaded or updated since this page opened. Refresh the page to reconnect.';
    }
    return `Extension error: ${err?.message}`;
  }

  async function getBudget() {
    try {
      const { catchMeUpConfig } = await chrome.storage.local.get('catchMeUpConfig');
      return TRANSCRIPT_BUDGET_CHARS[catchMeUpConfig?.transcriptBudget] || TRANSCRIPT_BUDGET_CHARS.standard;
    } catch {
      return TRANSCRIPT_BUDGET_CHARS.standard;
    }
  }

  // Readability works on a clone, so the live page is never touched. Returns
  // the article state, or null when the page has no usable article.
  async function extract() {
    let parsed = null;
    try {
      parsed = new Readability(document.cloneNode(true)).parse();
    } catch (err) {
      console.warn('[TD;DW] Readability failed:', err.message);
    }
    if (!parsed) return null;

    const cleaned = CMU.cleanArticleText(parsed.textContent);
    if (cleaned.length < MIN_ARTICLE_CHARS) return null;

    // Reading time describes the article, not what fits in the model's window.
    const readingMinutes = CMU.readingMinutes(cleaned);
    const { text, truncated } = CMU.capArticleText(cleaned, await getBudget());
    const siteName = parsed.siteName || null;
    return {
      kind: 'article',
      service: siteName || location.hostname,
      title: parsed.title || document.title,
      byline: parsed.byline || null,
      siteName,
      url: location.href,
      lang: parsed.lang || document.documentElement.lang || null,
      text,
      truncated,
      readingMinutes
    };
  }

  // In-memory follow-up conversation, scoped to the current summary. `epoch`
  // bumps on every summary so a question still in flight when the user hits
  // "Summarize again" can't push its answer into the new conversation.
  const convo = { article: null, summaryText: null, history: [], epoch: 0 };

  async function runSummary() {
    const overlay = CMU.overlay;

    convo.epoch++;
    convo.article = null;
    convo.summaryText = null;
    convo.history = [];

    const article = await extract();
    if (!article) {
      // Minimal state so the panel still gets article-mode chrome (title, no
      // progress bar, "Summarize again").
      overlay.showError(NOT_AN_ARTICLE, { kind: 'article', service: location.hostname, title: document.title });
      return;
    }

    overlay.showLoading(article);

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'GET_ARTICLE_SUMMARY', article });
    } catch (err) {
      result = { ok: false, error: extensionErrorMessage(err) };
    }

    if (!result) {
      overlay.showError('No response from the extension. Try reloading it in your browser’s extensions page.', article);
    } else if (!result.ok) {
      overlay.showError(result.error, article, result.llm);
    } else {
      overlay.showRecap(result.summaryText, article, 'article', result.llm);
      convo.article = article;
      convo.summaryText = result.summaryText;
    }
  }

  async function toggle() {
    const overlay = CMU.overlay;
    if (overlay.isVisible()) {
      overlay.hide();
      return;
    }
    await runSummary();
  }

  // Thrown when a question resolves after its conversation was replaced. The
  // overlay treats it as a no-op (see the `stale` check in submitQuestion).
  class StaleAnswerError extends Error {
    constructor() {
      super('stale answer');
      this.stale = true;
    }
  }

  // Follow-up Q&A. Returns the answer string (the overlay awaits it) or throws
  // so the overlay can render the error in the pending answer bubble.
  async function onAsk(question) {
    if (!convo.article) throw new Error('Ask again after a summary has loaded.');
    const epoch = convo.epoch;
    const payload = {
      type: 'ASK_ARTICLE_QUESTION',
      article: convo.article,
      summaryText: convo.summaryText,
      history: convo.history,
      question
    };
    let result;
    try {
      result = await chrome.runtime.sendMessage(payload);
    } catch (err) {
      if (epoch !== convo.epoch) throw new StaleAnswerError();
      throw new Error(extensionErrorMessage(err));
    }
    if (epoch !== convo.epoch) throw new StaleAnswerError();
    if (!result) throw new Error('No response from the extension. Try reloading it in your browser’s extensions page.');
    if (!result.ok) throw new Error(result.error || 'The model didn’t answer.');
    convo.history.push({ question, answer: result.answer });
    return result.answer;
  }

  // No onSeek: there is no timeline to jump around in.
  CMU.overlay.setHandlers({ onRefresh: runSummary, onAsk });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'TOGGLE_OVERLAY') toggle();
  });
})();
