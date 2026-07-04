// Shadow-DOM overlay panel. Static markup only via innerHTML; anything that
// came from the LLM or the page is rendered with textContent / createTextNode
// — never innerHTML.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

globalThis.TDDW.overlay = (() => {
  let host = null;
  let els = null;
  const handlers = { onRefresh: null, onSeek: null };

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'tddw-root';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = globalThis.TDDW.overlayCss;

    const panel = document.createElement('div');
    panel.className = 'cmu-panel';
    panel.innerHTML = `
      <div class="cmu-header">
        <span class="cmu-brand"></span>
        <div class="cmu-titles">
          <div class="cmu-title">TD;DW</div>
          <div class="cmu-subtitle" hidden></div>
        </div>
        <span class="cmu-chip" hidden></span>
        <button class="cmu-close" title="Close (Esc)">&#10005;</button>
      </div>
      <div class="cmu-progress"><div class="cmu-progress-fill"></div></div>
      <div class="cmu-body"></div>
      <div class="cmu-footer">
        <button class="cmu-btn cmu-secondary cmu-refresh">Refresh at current time</button>
        <button class="cmu-btn cmu-dismiss">Close</button>
      </div>
    `;
    shadow.append(style, panel);
    document.documentElement.appendChild(host);

    els = {
      panel,
      title: panel.querySelector('.cmu-title'),
      subtitle: panel.querySelector('.cmu-subtitle'),
      chip: panel.querySelector('.cmu-chip'),
      progress: panel.querySelector('.cmu-progress-fill'),
      body: panel.querySelector('.cmu-body')
    };
    panel.querySelector('.cmu-close').addEventListener('click', hide);
    panel.querySelector('.cmu-dismiss').addEventListener('click', hide);
    panel.querySelector('.cmu-refresh').addEventListener('click', () => handlers.onRefresh?.());
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && isVisible()) {
          e.stopPropagation();
          hide();
        }
      },
      true
    );
    host.style.display = 'none';
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '?:??';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function parseTimestamp(ts) {
    const parts = ts.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  function setContext(videoState) {
    ensure();
    els.panel.dataset.service = videoState?.service || '';
    // YouTube gets the full-height column (covers the suggested-videos rail);
    // streaming services keep the compact card.
    els.panel.classList.toggle('cmu-tall', videoState?.service === 'YouTube');

    els.title.textContent = videoState?.title || 'TD;DW';
    if (videoState?.episodeInfo) {
      els.subtitle.textContent = videoState.episodeInfo;
      els.subtitle.hidden = false;
    } else {
      els.subtitle.hidden = true;
    }

    if (Number.isFinite(videoState?.currentTimeSeconds)) {
      els.chip.textContent = `up to ${formatTime(videoState.currentTimeSeconds)}`;
      els.chip.hidden = false;
    } else {
      els.chip.hidden = true;
    }

    const pct =
      Number.isFinite(videoState?.currentTimeSeconds) &&
      Number.isFinite(videoState?.durationSeconds) &&
      videoState.durationSeconds > 0
        ? Math.min(100, (videoState.currentTimeSeconds / videoState.durationSeconds) * 100)
        : 0;
    els.progress.style.width = `${pct}%`;
  }

  function show() {
    ensure();
    host.style.display = '';
  }

  function hide() {
    if (host) host.style.display = 'none';
  }

  function isVisible() {
    return !!host && host.isConnected && host.style.display !== 'none';
  }

  function showLoading(videoState) {
    setContext(videoState);
    els.body.innerHTML = `
      <div class="cmu-skeleton">
        <div class="cmu-bone"></div><div class="cmu-bone"></div><div class="cmu-bone"></div>
        <div class="cmu-bone"></div><div class="cmu-bone"></div><div class="cmu-bone"></div>
      </div>
      <div class="cmu-loading-label"></div>
    `;
    els.body.querySelector('.cmu-loading-label').textContent = videoState?.title
      ? `Catching you up on “${videoState.title}”…`
      : 'Catching you up…';
    show();
  }

  // Minimal safe rich text: only **bold** is honored, everything else is text.
  function appendRich(el, text) {
    const parts = text.split('**');
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) {
        const b = document.createElement('strong');
        b.textContent = part;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  // One bullet line → list item. A leading "[m:ss]" becomes a time chip —
  // a seek button when an onSeek handler exists, a plain label otherwise.
  function renderItem(line, index) {
    const li = document.createElement('li');
    li.className = 'cmu-item';
    li.style.animationDelay = `${Math.min(index * 45, 450)}ms`;

    const tsMatch = line.match(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s*/);
    if (tsMatch) {
      line = line.slice(tsMatch[0].length);
      const seconds = parseTimestamp(tsMatch[1]);
      const chip = document.createElement(handlers.onSeek && seconds !== null ? 'button' : 'span');
      chip.className = 'cmu-ts';
      chip.textContent = tsMatch[1];
      if (chip.tagName === 'BUTTON') {
        chip.title = 'Jump to this moment';
        chip.addEventListener('click', () => handlers.onSeek(seconds));
      }
      li.appendChild(chip);
    } else {
      const dot = document.createElement('span');
      dot.className = 'cmu-dot';
      li.appendChild(dot);
    }

    const text = document.createElement('span');
    text.className = 'cmu-text';
    appendRich(text, line);
    li.appendChild(text);
    return li;
  }

  // Provenance banner: tells the reader whether the recap is grounded in the
  // real subtitles/captions or recalled from the model's training. Source is
  // the honest trust signal — a model's self-rated "confidence" is not.
  const SOURCE_BADGES = {
    transcript: { cls: 'cmu-src-grounded', icon: '✓', label: 'Built from this title’s subtitles' },
    knowledge: { cls: 'cmu-src-memory', icon: '🧠', label: 'From the model’s memory — may be imperfect' }
  };

  function renderSourceBadge(source) {
    const meta = SOURCE_BADGES[source];
    if (!meta) return null;
    const badge = document.createElement('div');
    badge.className = `cmu-source ${meta.cls}`;
    const icon = document.createElement('span');
    icon.className = 'cmu-source-icon';
    icon.textContent = meta.icon;
    const label = document.createElement('span');
    label.textContent = meta.label;
    badge.append(icon, label);
    return badge;
  }

  function showRecap(recapText, videoState, source) {
    setContext(videoState);
    const lines = recapText
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    els.body.innerHTML = '';
    const badge = renderSourceBadge(source);
    if (badge) els.body.appendChild(badge);
    const ul = document.createElement('ul');
    ul.className = 'cmu-list';
    lines.forEach((line, i) => ul.appendChild(renderItem(line, i)));
    els.body.appendChild(ul);
    show();
  }

  function showUnknown(message, videoState) {
    setContext(videoState);
    els.body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'cmu-muted';
    p.textContent = message;
    els.body.appendChild(p);
    show();
  }

  function showError(message, videoState) {
    setContext(videoState);
    els.body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'cmu-error';
    p.textContent = message;
    const settings = document.createElement('button');
    settings.className = 'cmu-link';
    settings.textContent = 'Open settings';
    settings.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
    els.body.append(p, settings);
    show();
  }

  function setHandlers(next) {
    Object.assign(handlers, next);
  }

  return { showLoading, showRecap, showUnknown, showError, setContext, show, hide, isVisible, setHandlers };
})();
