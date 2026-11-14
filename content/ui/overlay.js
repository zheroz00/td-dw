// Shadow-DOM overlay panel. Static markup only via innerHTML; anything that
// came from the LLM or the page is rendered with textContent / createTextNode
// — never innerHTML.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

globalThis.TDDW.overlay = (() => {
  let host = null;
  let els = null;
  let asking = false; // one follow-up in flight at a time
  const handlers = { onRefresh: null, onSeek: null, onAsk: null };

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
      <form class="cmu-ask" hidden>
        <input class="cmu-ask-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Ask a follow-up…" aria-label="Ask a follow-up question" />
        <button class="cmu-ask-send" type="submit" title="Ask">&#10148;</button>
      </form>
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
      progressTrack: panel.querySelector('.cmu-progress'),
      progress: panel.querySelector('.cmu-progress-fill'),
      body: panel.querySelector('.cmu-body'),
      askForm: panel.querySelector('.cmu-ask'),
      askInput: panel.querySelector('.cmu-ask-input'),
      askSend: panel.querySelector('.cmu-ask-send'),
      refresh: panel.querySelector('.cmu-refresh'),
      qa: null // the Q&A thread container, (re)created per recap in showRecap
    };
    panel.querySelector('.cmu-close').addEventListener('click', hide);
    panel.querySelector('.cmu-dismiss').addEventListener('click', hide);
    els.refresh.addEventListener('click', () => handlers.onRefresh?.());
    els.askForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitQuestion();
    });
    // Keep keystrokes inside the follow-up box. The panel is in a closed shadow
    // root, so the host page (YouTube/Netflix/…) can't see that a text field is
    // focused — its own shortcuts (space / "k" = play-pause, arrows = seek) would
    // otherwise fire on every character typed, resuming the video and stealing
    // focus. Stop these events from bubbling out to the page's document/window
    // handlers. Escape still closes the panel: that handler runs in the capture
    // phase, which fires before this bubble-phase listener.
    ['keydown', 'keyup', 'keypress'].forEach((type) => {
      els.askInput.addEventListener(type, (e) => e.stopPropagation());
    });
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
    const isArticle = videoState?.kind === 'article';
    // Hide the follow-up row by default; only showRecap re-enables it. This
    // keeps it off during loading / error / unknown-title / <1-min states.
    els.askForm.hidden = true;
    // An article's "service" is just its site name; don't let a site called
    // "Netflix" borrow that service's accent colour.
    els.panel.dataset.service = isArticle ? '' : videoState?.service || '';
    // YouTube gets the full-height column (covers the suggested-videos rail);
    // streaming services keep the compact card. Articles stay compact too: the
    // card grows with its content and scrolls, so it never blankets the page
    // being read.
    els.panel.classList.toggle('cmu-tall', !isArticle && videoState?.service === 'YouTube');

    els.title.textContent = videoState?.title || 'TD;DW';
    // Subtitle: episode info for video; byline and site for an article (one of
    // them only when they match, which some sites do).
    const subtitle = isArticle
      ? [...new Set([videoState.byline, videoState.siteName].filter(Boolean))].join(' · ')
      : videoState?.episodeInfo;
    if (subtitle) {
      els.subtitle.textContent = subtitle;
      els.subtitle.hidden = false;
    } else {
      els.subtitle.hidden = true;
    }

    if (isArticle) {
      els.chip.textContent = `${videoState.readingMinutes} min read`;
      els.chip.hidden = !Number.isFinite(videoState.readingMinutes);
    } else if (Number.isFinite(videoState?.currentTimeSeconds)) {
      els.chip.textContent = `up to ${formatTime(videoState.currentTimeSeconds)}`;
      els.chip.hidden = false;
    } else {
      els.chip.hidden = true;
    }

    // Set both ways on every call: the one overlay instance serves whichever
    // mode opened it last, so video defaults must be restored explicitly.
    els.progressTrack.hidden = isArticle;
    els.refresh.textContent = isArticle ? 'Summarize again' : 'Refresh at current time';
    const askLabel = isArticle ? 'Ask about this article…' : 'Ask a follow-up…';
    els.askInput.placeholder = askLabel;
    els.askInput.setAttribute('aria-label', isArticle ? askLabel : 'Ask a follow-up question');

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
    // Reset the follow-up input; the Q&A thread lives in .cmu-body and is wiped
    // whenever the body is rebuilt (next showLoading/showRecap), so closing then
    // reopening starts a fresh conversation.
    if (els) {
      els.askForm.hidden = true;
      els.askInput.value = '';
    }
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
    const verb = videoState?.kind === 'article' ? 'Summarizing' : 'Catching you up on';
    els.body.querySelector('.cmu-loading-label').textContent = videoState?.title
      ? `${verb} “${videoState.title}”…`
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

  // The whole bullet seeks, not just its tiny chip: a bigger target, and the
  // hover highlight makes it obvious the line is clickable. The chip stays a
  // plain span inside it (no button nested in a button-role element).
  function makeSeekable(li, label, seconds) {
    li.classList.add('cmu-seekable');
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.title = `Jump to ${label}`;
    li.addEventListener('click', () => handlers.onSeek(seconds));
    li.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      // Space is also the page's play/pause shortcut; keep it from reaching
      // YouTube (the panel's closed shadow root hides the focused element).
      e.stopPropagation();
      handlers.onSeek(seconds);
    });
  }

  // One bullet line → list item. A leading "[m:ss]" becomes a time chip, and
  // the whole item seeks there when an onSeek handler exists.
  function renderItem(line, index) {
    const li = document.createElement('li');
    li.className = 'cmu-item';
    li.style.animationDelay = `${Math.min(index * 45, 450)}ms`;

    const tsMatch = line.match(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s*/);
    if (tsMatch) {
      line = line.slice(tsMatch[0].length);
      const seconds = parseTimestamp(tsMatch[1]);
      const chip = document.createElement('span');
      chip.className = 'cmu-ts';
      chip.textContent = tsMatch[1];
      if (handlers.onSeek && seconds !== null) makeSeekable(li, tsMatch[1], seconds);
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
    // Hybrid: memory recap anchored by the captions seen on screen since the
    // tab loaded. The label carries the coverage start so the reader knows
    // which part is grounded.
    hybrid: { cls: 'cmu-src-hybrid', icon: '🧠✓', label: 'From memory, anchored by subtitles' },
    // Hybrid's fallback when the model doesn't know the title: grounded, but
    // only for the window the captions covered.
    captions: { cls: 'cmu-src-grounded', icon: '✓', label: 'Built from the subtitles seen so far' },
    knowledge: { cls: 'cmu-src-memory', icon: '🧠', label: 'From the model’s memory, may be imperfect' },
    // Article mode: always the page's own text, never the model's memory.
    article: { cls: 'cmu-src-grounded', icon: '✓', label: 'Built from this page’s text' }
  };

  function badgeLabel(source, videoState) {
    const base = SOURCE_BADGES[source].label;
    const transcript = videoState?.transcript;
    if (source === 'article') {
      return videoState?.truncated ? `${base} (long article, summarized from the first part)` : base;
    }
    if (source === 'transcript') {
      // A transcript that had to be sampled down to fit the budget is still
      // grounded, just incomplete: say so rather than implying full coverage.
      return transcript?.truncated ? `${base} (sampled to fit)` : base;
    }
    if (source === 'captions') {
      // Captured from (nearly) the start = the whole story so far, no gap to warn about.
      const start = transcript?.coverageStartSeconds;
      if (!Number.isFinite(start) || start < 60) return base;
      return `${base} (from ${formatTime(start)} on). The model doesn't know this title, so nothing earlier is covered.`;
    }
    if (source === 'hybrid') {
      const from = Number.isFinite(transcript?.coverageStartSeconds)
        ? ` from ${formatTime(transcript.coverageStartSeconds)} on`
        : '';
      return `${base}${from}`;
    }
    // Memory-only on a site where live captions could have grounded it: the
    // fix is in the viewer's hands, so say so.
    return videoState?.captionCapable ? `${base}. Turn on subtitles and TD;DW can anchor the recap.` : base;
  }

  function renderSourceBadge(source, videoState) {
    const meta = SOURCE_BADGES[source];
    if (!meta) return null;
    const badge = document.createElement('div');
    badge.className = `cmu-source ${meta.cls}`;
    const icon = document.createElement('span');
    icon.className = 'cmu-source-icon';
    icon.textContent = meta.icon;
    const label = document.createElement('span');
    label.textContent = badgeLabel(source, videoState);
    badge.append(icon, label);
    return badge;
  }

  // Muted "Endpoint · model" line naming what produced this result. When a
  // router picked the model (openrouter/free), show what actually answered and
  // name the router; a served id that merely adds a version suffix or prefix
  // to the requested one counts as the same model.
  function renderModelLine(llm) {
    if (!llm?.model) return null;
    const served = llm.servedModel || llm.model;
    const routed = !served.includes(llm.model);
    const line = document.createElement('div');
    line.className = 'cmu-model';
    line.textContent = `${llm.endpoint} · ${routed ? `${served} (picked by ${llm.model})` : llm.model}`;
    return line;
  }

  function showRecap(recapText, videoState, source, llm) {
    setContext(videoState);
    const lines = recapText
      .split('\n')
      // Strip a leading list marker. `*` is only a bullet when it's a lone
      // asterisk — `\*(?!\*)` leaves a line that opens with **bold** intact
      // instead of eating one of its markers.
      .map((l) => l.replace(/^\s*(?:[-•]|\*(?!\*)|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    els.body.innerHTML = '';
    const badge = renderSourceBadge(source, videoState);
    if (badge) els.body.appendChild(badge);
    const modelLine = renderModelLine(llm);
    if (modelLine) els.body.appendChild(modelLine);
    const ul = document.createElement('ul');
    ul.className = 'cmu-list';
    lines.forEach((line, i) => ul.appendChild(renderItem(line, i)));
    els.body.appendChild(ul);
    // Fresh Q&A thread for this recap; follow-ups append here so they scroll
    // with the summary.
    els.qa = document.createElement('div');
    els.qa.className = 'cmu-qa';
    els.body.appendChild(els.qa);
    enableAsk();
    show();
  }

  function enableAsk() {
    // Only offer follow-ups when there's a real recap to ask about. Also clears
    // any left-over disabled state from a question that was still in flight when
    // this (fresh) recap replaced the previous one.
    setAsking(false);
    els.askForm.hidden = !handlers.onAsk;
  }

  // One follow-up round trip: append the question, show a pending answer, await
  // the handler, then fill it in. Model text is rendered via appendRich /
  // textContent — never innerHTML.
  async function submitQuestion() {
    if (asking || !handlers.onAsk || !els.qa) return;
    const question = els.askInput.value.trim();
    if (!question) return;

    els.askInput.value = '';
    setAsking(true);

    const turn = document.createElement('div');
    turn.className = 'cmu-turn';
    const q = document.createElement('div');
    q.className = 'cmu-q';
    q.textContent = question;
    const a = document.createElement('div');
    a.className = 'cmu-a cmu-a-pending';
    a.textContent = '…';
    turn.append(q, a);
    els.qa.appendChild(turn);
    els.body.scrollTop = els.body.scrollHeight;

    let stale = false;
    try {
      const answer = await handlers.onAsk(question);
      a.classList.remove('cmu-a-pending');
      a.textContent = '';
      appendRich(a, answer || '');
    } catch (err) {
      // The recap was refreshed while this was in flight: its bubble is detached
      // and a fresh panel (with its own reset state) is already up. Leave it be.
      if (err?.stale) {
        stale = true;
        return;
      }
      a.classList.remove('cmu-a-pending');
      a.classList.add('cmu-a-error');
      a.textContent = err?.message || 'Something went wrong — try again.';
      // Put the question back so the user can retry without retyping it.
      if (!els.askInput.value) els.askInput.value = question;
    } finally {
      // A superseded question must not touch the new panel's input/scroll.
      if (!stale) {
        setAsking(false);
        els.body.scrollTop = els.body.scrollHeight;
        els.askInput.focus();
      }
    }
  }

  function setAsking(state) {
    asking = state;
    els.askInput.disabled = state;
    els.askSend.disabled = state;
  }

  function showUnknown(message, videoState, llm) {
    setContext(videoState);
    els.body.innerHTML = '';
    const modelLine = renderModelLine(llm);
    if (modelLine) els.body.appendChild(modelLine);
    const p = document.createElement('p');
    p.className = 'cmu-muted';
    p.textContent = message;
    els.body.appendChild(p);
    show();
  }

  function showError(message, videoState, llm) {
    setContext(videoState);
    els.body.innerHTML = '';
    const modelLine = renderModelLine(llm);
    if (modelLine) els.body.appendChild(modelLine);
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
