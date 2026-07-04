// Site adapter: Netflix. Class names shift between releases, so every
// selector is a candidate list — all Netflix DOM fragility stays in readTitle.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  const TITLE_SELECTORS = ['[data-uia="video-title"]', '.watch-video--title-text'];

  // Netflix renders series titles as one node containing the show name plus
  // <h4>/<span> children for "S2:E4" and the episode name.
  function readTitle() {
    let el = null;
    for (const sel of TITLE_SELECTORS) {
      el = document.querySelector(sel);
      if (el && el.textContent.trim()) break;
      el = null;
    }
    if (!el) return null;

    const parts = Array.from(el.querySelectorAll('h4, span'))
      .map((n) => n.textContent.trim())
      .filter(Boolean);
    if (parts.length > 1) return { title: parts[0], episodeInfo: parts.slice(1).join(' ') };
    if (parts.length === 1) return { title: parts[0], episodeInfo: null };
    return { title: el.textContent.trim() || null, episodeInfo: null };
  }

  globalThis.TDDW.adapters.push(
    globalThis.TDDW.makeDomVideoAdapter({
      service: 'netflix',
      displayName: 'Netflix',
      hostSuffix: 'netflix.com',
      isPlayerPage: (loc) => loc.pathname.startsWith('/watch'),
      readTitle,
      nudgeSelector: '.watch-video'
    })
  );
})();
