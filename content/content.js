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

  async function runRecap() {
    const overlay = CMU.overlay;
    const adapter = CMU.getAdapter();
    const state = adapter ? await adapter.getVideoState() : null;

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

  const handlers = { onRefresh: runRecap };
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
