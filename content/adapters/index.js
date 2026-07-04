// Picks the site adapter for the current page.
// v2 seam: adapters will grow getTranscriptUpTo(seconds) when the
// transcript-based recap provider lands.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

globalThis.TDDW.getAdapter = function () {
  return globalThis.TDDW.adapters.find((a) => a.matches(location)) || null;
};
