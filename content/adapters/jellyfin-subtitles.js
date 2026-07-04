// Jellyfin subtitle parsing. The adapter asks Jellyfin for the subtitle track
// as WebVTT (Stream.vtt) — the cleanest timestamped text format the server can
// serve for any text-based subtitle stream (SRT/ASS/embedded mov_text alike).
// Attaches to the shared namespace like the other content-script files; the
// manifest/dynamic registration loads this before jellyfin.js.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

(() => {
  // "HH:MM:SS.mmm" or "MM:SS.mmm" → milliseconds.
  function cueTimeToMs(stamp) {
    const parts = stamp.split(':');
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) [h, m, s] = parts;
    else if (parts.length === 2) [m, s] = parts;
    else return NaN;
    return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s)) * 1000;
  }

  function formatTimestamp(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function decodeEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  }

  // WebVTT is blocks separated by blank lines. A cue block is:
  //   [optional id line]
  //   00:00:01.000 --> 00:00:04.000 [optional settings]
  //   text line(s)
  // We drop any cue starting after cutoffMs (spoiler-safe) and prefix each
  // kept line with its [m:ss] timestamp so recap bullets carry seek chips.
  // Returns { lines, language } | null.
  globalThis.TDDW.parseJellyfinSubtitles = function (vtt, cutoffMs, language) {
    if (!vtt || !/-->/.test(vtt)) return null;
    const lines = [];
    // Normalise newlines, then split into blocks on blank lines.
    const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/);
    const timing = /(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}/;

    for (const block of blocks) {
      const rows = block.split('\n');
      const timingIdx = rows.findIndex((r) => timing.test(r));
      if (timingIdx === -1) continue;

      const startStamp = rows[timingIdx].split('-->')[0].trim().replace(',', '.');
      const startMs = cueTimeToMs(startStamp);
      if (!Number.isFinite(startMs) || startMs > cutoffMs) continue;

      const text = rows
        .slice(timingIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '') // strip <c>, <i>, <b>, <v Speaker> etc.
        .replace(/\{\\[^}]*\}/g, '') // strip ASS override tags that survive conversion
        .replace(/\s+/g, ' ')
        .trim();
      if (text) lines.push(`[${formatTimestamp(startMs)}] ${decodeEntities(text)}`);
    }

    return lines.length ? { lines, language: language || 'unknown' } : null;
  };
})();
