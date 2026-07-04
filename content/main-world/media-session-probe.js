// Runs in the page's MAIN world (see manifest "world": "MAIN") — the only
// place navigator.mediaSession.metadata is visible. Streaming sites feed it
// the current title for OS media controls, which makes it a title source
// that survives player redesigns.
//
// Protocol: the isolated-world content script dispatches a
// 'cmu:probe-media-session' event; this handler synchronously mirrors the
// metadata into a data attribute on <html>, which both worlds can read.
(() => {
  document.addEventListener('cmu:probe-media-session', () => {
    const md = navigator.mediaSession?.metadata;
    document.documentElement.setAttribute(
      'data-cmu-media-meta',
      md ? JSON.stringify({ title: md.title || null, artist: md.artist || null, album: md.album || null }) : ''
    );
  });
})();
