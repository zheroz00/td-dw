// Site adapter: Disney+. Their player DOM has been redesigned more than once,
// so title selectors are best-effort candidates — expect to extend this list.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  const TITLE_SELECTORS = [
    '[data-testid="playback-video-title-label"]',
    '[data-testid="title"]',
    '.title-field',
    '.btm-media-overlays-container .title-field'
  ];
  const SUBTITLE_SELECTORS = ['[data-testid="subtitle"]', '.subtitle-field'];

  function firstText(selectors) {
    for (const sel of selectors) {
      const text = document.querySelector(sel)?.textContent.trim();
      if (text) return text;
    }
    return null;
  }

  // Safety net that survives Disney's DOM redesigns: while playing, the tab
  // title is "<content title> | Disney+".
  function titleFromDocumentTitle() {
    const t = document.title
      .replace(/\s*\|\s*Disney\+.*$/i, '')
      .replace(/^Watch(ing)?\s+/i, '')
      .trim();
    return t && !/^disney\+?$/i.test(t) ? t : null;
  }

  function readTitle() {
    const title = firstText(TITLE_SELECTORS) || titleFromDocumentTitle();
    if (!title) return null;
    return { title, episodeInfo: firstText(SUBTITLE_SELECTORS) };
  }

  // Ad-tier Disney+ stitches ads into the stream (duration = Infinity,
  // currentTime = session stream time incl. ads — useless for position).
  // The truth lives in the player's Timeline slider, inside open shadow DOM:
  // aria-valuenow = movie seconds, aria-valuemax = runtime seconds.
  function readPlayerTime() {
    const slider =
      globalThis.TDDW.queryDeepAll('[role="slider"][aria-label="Timeline"]')[0] ||
      globalThis.TDDW.queryDeepAll('.progress-bar__seekable-range')[0];
    if (!slider) return null;
    const current = parseFloat(slider.getAttribute('aria-valuenow'));
    const duration = parseFloat(slider.getAttribute('aria-valuemax'));
    return Number.isFinite(current)
      ? { current, duration: Number.isFinite(duration) ? duration : null }
      : null;
  }

  globalThis.TDDW.adapters.push(
    globalThis.TDDW.makeDomVideoAdapter({
      service: 'disneyplus',
      displayName: 'Disney+',
      hostSuffix: 'disneyplus.com',
      isPlayerPage: (loc) => /\/(video|play)\//.test(loc.pathname) || !!document.querySelector('video'),
      readTitle,
      nudgeSelector: 'video',
      readPlayerTime,
      playerTimeOnly: true
    })
  );
})();
