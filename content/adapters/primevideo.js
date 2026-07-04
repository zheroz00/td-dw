// Site adapter: Prime Video (primevideo.com). The atvwebplayersdk-* classes
// have been stable for years; the player is an in-page overlay so there is no
// reliable watch-path — video detection does the work.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  function readTitle() {
    const title = document.querySelector('.atvwebplayersdk-title-text')?.textContent.trim();
    if (!title) return null;
    const episodeInfo = document.querySelector('.atvwebplayersdk-subtitle-text')?.textContent.trim() || null;
    return { title, episodeInfo };
  }

  globalThis.TDDW.adapters.push(
    globalThis.TDDW.makeDomVideoAdapter({
      service: 'primevideo',
      displayName: 'Prime Video',
      hostSuffix: 'primevideo.com',
      readTitle,
      nudgeSelector: '.webPlayerUIContainer'
    })
  );
})();
