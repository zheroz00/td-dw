// Orchestration: gather video state from the site adapter, ask the service
// worker for a recap, render the result in the overlay.
(() => {
  const CMU = globalThis.TDDW;
  console.log('[TD;DW] content script loaded');

  async function getPauseOnOpen() {
    try {
      const { catchMeUpConfig } = await chrome.storage.local.get('catchMeUpConfig');
      return catchMeUpConfig?.pauseOnOpen !== false; // default true
    } catch {
      return true;
    }
  }

  // In-memory follow-up conversation, scoped to the current recap. Reset on each
  // new recap (below) and effectively cleared when the panel closes (reopening
  // runs a fresh recap). Never persisted. `epoch` bumps on every recap so a
  // question still in flight when the user hits "Refresh" can't push its answer
  // into the new conversation.
  const convo = { state: null, recapText: null, history: [], epoch: 0 };

  async function runRecap() {
    const overlay = CMU.overlay;
    const adapter = CMU.getAdapter();
    const state = adapter ? await adapter.getVideoState() : null;

    // A new recap starts a new conversation.
    convo.epoch++;
    convo.state = null;
    convo.recapText = null;
    convo.history = [];

    if (!state) {
      overlay.showError('Start playing a video first — TD;DW works on supported streaming watch pages.');
      return;
    }

    // Pause here (not in toggle) so it targets the video the adapter actually
    // found — possibly inside a player iframe, not the first one in the page.
    if (await getPauseOnOpen()) {
      (CMU.activeVideo || document.querySelector('video'))?.pause();
    }

    // Show the skeleton before the title check so "Refresh" visibly does
    // something even when the outcome is the same error again.
    overlay.showLoading(state);

    // A recap of the first few seconds is meaningless — don't ask the LLM.
    if (Number.isFinite(state.currentTimeSeconds) && state.currentTimeSeconds < 60) {
      overlay.showUnknown(
        'You’re less than a minute in — nothing to catch up on yet. Keep watching, then hit "Refresh at current time".',
        state
      );
      return;
    }

    if (!state.title) {
      overlay.showError(
        'Couldn’t read the title — hover the player so the controls appear, then hit "Refresh at current time".',
        state
      );
      return;
    }

    if (state.currentTimeSeconds === null) {
      overlay.showError(
        'Couldn’t read the playback position — move your mouse over the player so the controls appear, then hit "Refresh at current time".',
        state
      );
      return;
    }

    // Attach the real transcript when the adapter can supply one (YouTube).
    // Any failure here just means falling back to knowledge mode.
    if (adapter.getTranscriptUpTo && Number.isFinite(state.currentTimeSeconds)) {
      try {
        state.transcript = await adapter.getTranscriptUpTo(state.currentTimeSeconds);
      } catch (err) {
        console.warn('[TD;DW] transcript fetch failed, using knowledge mode:', err.message);
      }
    }

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'GET_RECAP', videoState: state });
    } catch (err) {
      result = { ok: false, error: `Extension error: ${err.message}` };
    }

    if (!result) {
      overlay.showError('No response from the extension — try reloading it in chrome://extensions.', state);
    } else if (!result.ok) {
      overlay.showError(result.error, state);
    } else if (!result.known) {
      overlay.showUnknown(result.message, state);
    } else {
      overlay.showRecap(result.recapText, state, result.source);
      // Retain context so follow-up questions can reuse the same transcript /
      // title grounding.
      convo.state = state;
      convo.recapText = result.recapText;
    }
  }

  async function toggle() {
    const overlay = CMU.overlay;
    if (overlay.isVisible()) {
      overlay.hide();
      return;
    }
    await runRecap();
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
  async function askQuestion(question) {
    if (!convo.state) throw new Error('Ask again after a recap has loaded.');
    // Snapshot the conversation this question belongs to. If the user refreshes
    // (new epoch) while we await, the answer is discarded rather than grafted
    // onto the fresh conversation.
    const epoch = convo.epoch;
    const payload = {
      type: 'ASK_QUESTION',
      videoState: convo.state,
      recapText: convo.recapText,
      history: convo.history,
      question
    };
    let result;
    try {
      result = await chrome.runtime.sendMessage(payload);
    } catch (err) {
      // If a refresh landed while the message was in flight, this failure
      // belongs to a dead conversation — drop it silently instead of showing an
      // error / restoring the question into the new panel.
      if (epoch !== convo.epoch) throw new StaleAnswerError();
      throw new Error(`Extension error: ${err.message}`);
    }
    if (epoch !== convo.epoch) {
      // Recap was refreshed out from under this question; drop it silently so
      // the overlay leaves the (now detached) pending bubble alone.
      throw new StaleAnswerError();
    }
    if (!result) throw new Error('No response from the extension — try reloading it in chrome://extensions.');
    if (!result.ok) throw new Error(result.error || 'The model didn’t answer.');
    convo.history.push({ question, answer: result.answer });
    return result.answer;
  }

  const handlers = { onRefresh: runRecap, onAsk: askQuestion };
  // Seekable time chips only where setting video.currentTime is safe —
  // Netflix & co. require their own player APIs for seeking.
  if (CMU.getAdapter()?.service === 'youtube') {
    handlers.onSeek = (seconds) => {
      const video = document.querySelector('video');
      if (video && Number.isFinite(seconds)) video.currentTime = seconds;
    };
  }
  CMU.overlay.setHandlers(handlers);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'TOGGLE_OVERLAY') toggle();
  });
})();
