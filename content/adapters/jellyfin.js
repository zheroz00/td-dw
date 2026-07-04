// Site adapter: Jellyfin. Unlike the DRM streaming sites, Jellyfin exposes a
// REST API that serves the actual subtitle files for the personal library, so
// this adapter reaches transcript-mode (like YouTube) rather than knowledge-mode.
//
// This file is only ever injected on the user's configured Jellyfin origin (via
// the dynamic content-script registration in the service worker), so every API
// call below is SAME-ORIGIN: no CORS, no host permission needed for the fetch,
// and the logged-in access token is read straight off the page. Loads after
// jellyfin-subtitles.js (parseJellyfinSubtitles) and before index.js.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  const MAX_TRANSCRIPT_CHARS = 60000; // keep the payload inside message limits
  const TICKS_PER_SECOND = 1e7; // Jellyfin RunTimeTicks are 100-ns units

  // The web client persists its logged-in session in localStorage. The canonical
  // key is 'jellyfin_credentials', but scan defensively in case a fork/version
  // uses a different key — we just need a { Servers: [{ AccessToken, UserId }] }.
  function readAuth() {
    const candidates = [];
    const direct = localStorage.getItem('jellyfin_credentials');
    if (direct) candidates.push(direct);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== 'jellyfin_credentials' && /credential/i.test(key)) {
        candidates.push(localStorage.getItem(key));
      }
    }
    for (const raw of candidates) {
      let servers;
      try { servers = JSON.parse(raw)?.Servers; } catch { continue; }
      if (!Array.isArray(servers) || !servers.length) continue;
      // Prefer the server whose address matches where we are; else first logged-in.
      const here = location.origin.toLowerCase();
      const match =
        servers.find((s) =>
          [s.ManualAddress, s.LocalAddress, s.RemoteAddress, s.Address]
            .some((a) => typeof a === 'string' && a.toLowerCase().replace(/\/+$/, '') === here)) ||
        servers.find((s) => s.AccessToken) ||
        servers[0];
      if (match?.AccessToken) {
        return { token: match.AccessToken, userId: match.UserId, serverId: match.Id };
      }
    }
    return null;
  }

  function isJellyfinPage() {
    return (
      !!document.querySelector('meta[name="application-name"][content="Jellyfin"]') ||
      !!readAuth()
    );
  }

  async function apiGet(path, token) {
    const res = await fetch(new URL(path, location.origin), {
      credentials: 'omit',
      headers: { 'X-Emby-Token': token, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Jellyfin ${path} failed (${res.status})`);
    return res.json();
  }

  // The playing item's id. Direct-play streams carry it in the <video> src
  // (/Videos/<32-hex>/...), but HLS/transcoded playback uses a blob: src, so
  // fall back to the Sessions API matched to this web client's device id.
  async function resolveItemId(video, auth) {
    const src = video?.currentSrc || '';
    const inSrc = src.match(/[Vv]ideos\/([0-9a-f]{32})/);
    if (inSrc) return inSrc[1];

    const deviceId = localStorage.getItem('_deviceId2');
    let sessions;
    try {
      sessions = await apiGet('/Sessions', auth.token);
    } catch {
      return null;
    }
    const mine =
      sessions.find((s) => s.DeviceId && s.DeviceId === deviceId && s.NowPlayingItem) ||
      sessions.find((s) => s.NowPlayingItem);
    return mine?.NowPlayingItem?.Id || null;
  }

  // Prefer a full-dialogue track in the UI language, then English, then any;
  // "Forced" subs only cover foreign-language lines, so they rank last.
  function pickSubtitleStream(streams) {
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    const score = (s) => {
      let n = 0;
      const l = (s.Language || '').toLowerCase();
      if (l.startsWith(lang)) n += 4;
      else if (l.startsWith('en') || l.startsWith('eng')) n += 2;
      if (s.IsDefault) n += 1;
      if (s.IsForced) n -= 3;
      return n;
    };
    return [...streams].sort((a, b) => score(b) - score(a))[0] || null;
  }

  // If the transcript is too long, sample lines evenly so the recap covers the
  // whole span (start → now), not just the beginning. Mirrors the YouTube cap.
  function capTranscript(lines) {
    let text = lines.join('\n');
    if (text.length <= MAX_TRANSCRIPT_CHARS) return { text, truncated: false };
    const keepRatio = MAX_TRANSCRIPT_CHARS / text.length;
    const sampled = lines.filter((_, i) => Math.floor(i * keepRatio) !== Math.floor((i - 1) * keepRatio));
    text = sampled.join('\n').slice(0, MAX_TRANSCRIPT_CHARS);
    console.warn(`[TD;DW] transcript truncated: kept ~${Math.round(keepRatio * 100)}% of ${lines.length} lines`);
    return { text, truncated: true };
  }

  // Cache the last item lookup so getVideoState() and getTranscriptUpTo() (called
  // back-to-back by content.js) don't hit the API twice for the same playback.
  let itemCache = null; // { itemId, item, source }

  async function loadItem(video, auth) {
    const itemId = await resolveItemId(video, auth);
    if (!itemId) return null;
    if (itemCache?.itemId === itemId) return itemCache;

    const item = await apiGet(`/Users/${auth.userId}/Items/${itemId}`, auth.token);
    const source = item.MediaSources?.[0] || null;
    itemCache = { itemId, item, source };
    return itemCache;
  }

  globalThis.TDDW.adapters.push({
    service: 'jellyfin',

    // This file is only injected on the configured Jellyfin origin, so a page
    // fingerprint is enough to confirm and keeps matches() synchronous.
    matches() {
      return isJellyfinPage();
    },

    async getVideoState() {
      const video = document.querySelector('video');
      if (!video) return null;
      globalThis.TDDW.activeVideo = video;

      const auth = readAuth();
      if (!auth) {
        // Not logged in / token unreadable — let the pipeline fall back to a
        // metadata-less knowledge recap using the page title.
        return {
          service: 'Jellyfin',
          title: document.title.replace(/\s*[|\-–]\s*Jellyfin\s*$/i, '').trim() || null,
          episodeInfo: null,
          currentTimeSeconds: video.currentTime,
          durationSeconds: Number.isFinite(video.duration) ? video.duration : null
        };
      }

      let loaded = null;
      try {
        loaded = await loadItem(video, auth);
      } catch (err) {
        console.warn('[TD;DW] Jellyfin item lookup failed:', err.message);
      }

      const item = loaded?.item;
      const isEpisode = item?.Type === 'Episode';
      const title = (isEpisode ? item.SeriesName : item?.Name) || null;
      const episodeInfo = isEpisode
        ? `S${item.ParentIndexNumber ?? '?'}:E${item.IndexNumber ?? '?'}${item.Name ? ` — ${item.Name}` : ''}`
        : null;
      const durationSeconds = item?.RunTimeTicks
        ? item.RunTimeTicks / TICKS_PER_SECOND
        : Number.isFinite(video.duration)
          ? video.duration
          : null;

      return {
        service: 'Jellyfin',
        title,
        episodeInfo,
        currentTimeSeconds: video.currentTime,
        durationSeconds
      };
    },

    // Real subtitles up to the timestamp. Returns null when the item has no
    // text-based subtitle track (image subs like PGS/VOBSUB carry no text), so
    // content.js falls back to knowledge-mode.
    async getTranscriptUpTo(seconds) {
      const auth = readAuth();
      const video = globalThis.TDDW.activeVideo || document.querySelector('video');
      if (!auth || !video) return null;

      const loaded = await loadItem(video, auth);
      if (!loaded) return null;
      const { itemId, item, source } = loaded;

      const streams = (source?.MediaStreams || item.MediaStreams || []).filter(
        (s) => s.Type === 'Subtitle' && s.IsTextSubtitleStream
      );
      const stream = pickSubtitleStream(streams);
      if (!stream) return null;

      const mediaSourceId = source?.Id || itemId;
      const url = new URL(
        `/Videos/${itemId}/${mediaSourceId}/Subtitles/${stream.Index}/Stream.vtt`,
        location.origin
      );
      // The subtitle stream endpoint predates token headers on some versions;
      // pass the key both ways so it authorises regardless.
      url.searchParams.set('api_key', auth.token);

      const res = await fetch(url, {
        credentials: 'omit',
        headers: { 'X-Emby-Token': auth.token }
      });
      if (!res.ok) throw new Error(`Jellyfin subtitle fetch failed (${res.status})`);
      const vtt = await res.text();

      const parsed = globalThis.TDDW.parseJellyfinSubtitles(vtt, seconds * 1000, stream.Language);
      if (!parsed) return null;

      const { text, truncated } = capTranscript(parsed.lines);
      return { text, language: parsed.language, autoGenerated: false, truncated };
    }
  });
})();
