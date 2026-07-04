// Shared factory for streaming-site adapters (Netflix, Prime Video, Disney+).
// They all follow the same dance: find the <video>, wake the player controls
// if the title element isn't rendered, read title/episode, report timestamp.
// Per-site fragility lives in the config each site file passes in.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

// querySelectorAll that also descends into open shadow roots and same-origin
// iframes (players like Disney+'s Hive render their whole UI in shadow DOM).
globalThis.TDDW.queryDeepAll = function queryDeepAll(selector, root = document, acc = [], depth = 0) {
  if (depth > 20) return acc;
  acc.push(...root.querySelectorAll(selector));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) queryDeepAll(selector, el.shadowRoot, acc, depth + 1);
  }
  if (root === document) {
    for (const f of document.querySelectorAll('iframe')) {
      try {
        if (f.contentDocument) queryDeepAll(selector, f.contentDocument, acc, depth + 1);
      } catch { /* cross-origin */ }
    }
  }
  return acc;
};

globalThis.TDDW.makeDomVideoAdapter = function ({
  service,        // machine name, e.g. 'netflix'
  displayName,    // what the prompt/overlay show, e.g. 'Netflix'
  hostSuffix,     // 'netflix.com'
  isPlayerPage,   // (location) => bool; omit to rely on video detection alone
  readTitle,      // () => { title, episodeInfo } | null — all site DOM fragility here
  nudgeSelector,  // container to poke with a synthetic mousemove to wake controls
  readPlayerTime, // optional () => { current, duration } | null — read the player UI's
                  // own clock when video.currentTime can't be trusted
  playerTimeOnly  // true: NEVER fall back to video.currentTime (ad-stitched streams
                  // report stream time incl. ads, not movie position)
}) {
  // Some players (Disney+'s Hive) keep the real <video> inside a same-origin
  // iframe while the top page holds a stub — search every reachable frame.
  function collectVideos(doc, acc = []) {
    acc.push(...doc.querySelectorAll('video'));
    for (const frame of doc.querySelectorAll('iframe')) {
      try {
        if (frame.contentDocument) collectVideos(frame.contentDocument, acc);
      } catch {
        /* cross-origin frame — not ours to read */
      }
    }
    return acc;
  }

  // MSE players (Disney+'s Hive) report duration = Infinity like a live
  // stream; the real length lives in the seekable range instead.
  function videoDuration(v) {
    if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
    try {
      if (v.seekable?.length) {
        const end = v.seekable.end(v.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch { /* seekable can throw while the stream initializes */ }
    return null;
  }

  // Pages can carry several <video> elements (background loops, trailers,
  // stubs). Prefer the one that is actually progressing: advanced playhead
  // beats 0:00, playing beats paused, longer runtime beats shorter.
  // Infinity duration must NOT disqualify — that's how MSE players look.
  function findVideo() {
    const all = collectVideos(document);
    const candidates = all.filter((v) => v.duration > 0 || v.currentTime > 0); // Infinity > 0 is true
    candidates.sort(
      (a, b) =>
        (b.currentTime > 0) - (a.currentTime > 0) ||
        !b.paused - !a.paused ||
        (videoDuration(b) || 0) - (videoDuration(a) || 0)
    );
    return candidates[0] || all[0] || null;
  }

  function nudgeControls() {
    const target = (nudgeSelector && document.querySelector(nudgeSelector)) || document.body;
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  // Universal fallback: the Media Session metadata the site feeds to OS media
  // controls. Lives in the page's main world; media-session-probe.js mirrors
  // it into a DOM attribute for us (the event dispatch is synchronous).
  function readMediaSessionTitle() {
    document.dispatchEvent(new Event('cmu:probe-media-session'));
    const raw = document.documentElement.getAttribute('data-cmu-media-meta');
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw);
      if (!meta?.title) return null;
      // Some sites stuff branding into the artist field — junk episode info
      // makes the LLM doubt it knows the title, so drop it.
      const artist = meta.artist?.trim();
      const isBranding = !artist || /^(disney\+?|netflix|prime video|amazon|youtube)$/i.test(artist) || artist === meta.title;
      return { title: meta.title, episodeInfo: isBranding ? null : artist };
    } catch {
      return null;
    }
  }

  return {
    service,

    matches(loc) {
      return loc.hostname.endsWith(hostSuffix);
    },

    // Read lazily at activation time — avoids SPA-navigation staleness.
    async getVideoState() {
      if (isPlayerPage && !isPlayerPage(location)) return null;
      const video = findVideo();
      if (!video) return null;
      // Remember which element is the real player so pause/seek target it
      // (document.querySelector('video') may hit a stub in another frame).
      globalThis.TDDW.activeVideo = video;

      // Site DOM first (richest episode info), then Media Session metadata.
      // Title elements often only exist while player controls are visible —
      // poke the player and retry once before giving up.
      let info = readTitle() || readMediaSessionTitle();
      let playerTime = readPlayerTime ? readPlayerTime() : null;
      if (!info?.title || (readPlayerTime && !playerTime)) {
        nudgeControls();
        await new Promise((r) => setTimeout(r, 300));
        if (!info?.title) info = readTitle() || readMediaSessionTitle();
        if (!playerTime && readPlayerTime) playerTime = readPlayerTime();
      }

      // currentTimeSeconds: null signals "position unreadable right now" —
      // content.js turns that into a "wake the controls" hint.
      const currentTimeSeconds = playerTime
        ? playerTime.current
        : playerTimeOnly
          ? null
          : video.currentTime;

      return {
        service: displayName,
        title: info?.title || null,
        episodeInfo: info?.episodeInfo || null,
        currentTimeSeconds,
        durationSeconds: playerTime?.duration ?? videoDuration(video)
      };
    }
  };
};
