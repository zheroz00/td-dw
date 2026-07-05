// Overlay CSS as a JS string (no build step, no web_accessible_resources).
// Lives inside a closed shadow root, so nothing here can collide with the page.
globalThis.TDDW = globalThis.TDDW || { adapters: [] };

globalThis.TDDW.overlayCss = `
  :host {
    all: initial;
  }
  .cmu-panel {
    --accent: #8ab4f8;
    --accent-soft: rgba(138, 180, 248, 0.16);
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    width: 380px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    background: rgba(17, 19, 25, 0.92);
    backdrop-filter: blur(18px) saturate(1.2);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
    color: #e8eaed;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    animation: cmu-enter 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes cmu-enter {
    from { opacity: 0; transform: translateY(-8px) scale(0.985); }
    to   { opacity: 1; transform: none; }
  }
  /* Per-service accent */
  .cmu-panel[data-service="YouTube"]     { --accent: #ff6b60; --accent-soft: rgba(255, 107, 96, 0.16); }
  .cmu-panel[data-service="Netflix"]     { --accent: #e50914; --accent-soft: rgba(229, 9, 20, 0.18); }
  .cmu-panel[data-service="Prime Video"] { --accent: #38bdf8; --accent-soft: rgba(56, 189, 248, 0.16); }
  .cmu-panel[data-service="Disney+"]     { --accent: #7aa7ff; --accent-soft: rgba(122, 167, 255, 0.16); }

  /* Full-height column (YouTube): sized to blanket the suggested-videos
     rail so its thumbnails stay hidden while the recap is open. */
  .cmu-panel.cmu-tall {
    width: 460px;
    height: calc(100vh - 24px);
  }

  .cmu-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px;
  }
  .cmu-brand {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
  .cmu-titles {
    flex: 1;
    min-width: 0;
  }
  .cmu-title {
    font-weight: 650;
    font-size: 14.5px;
    letter-spacing: 0.1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmu-subtitle {
    font-size: 11.5px;
    color: #9aa0a6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmu-chip {
    flex: none;
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid var(--accent-soft);
    border-radius: 999px;
    padding: 3px 11px;
    font-size: 11.5px;
    font-weight: 650;
    letter-spacing: 0.2px;
  }
  .cmu-close {
    flex: none;
    background: none;
    border: none;
    color: #9aa0a6;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 8px;
  }
  .cmu-close:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }

  .cmu-progress {
    height: 3px;
    margin: 0 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .cmu-progress-fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 0.4s ease;
  }

  .cmu-body {
    flex: 1;
    padding: 14px 16px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.18) transparent;
  }

  /* Recap list */
  .cmu-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cmu-item {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 7px 10px;
    border-radius: 10px;
    animation: cmu-item-in 0.3s ease both;
  }
  .cmu-item:hover { background: rgba(255, 255, 255, 0.045); }
  @keyframes cmu-item-in {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: none; }
  }
  .cmu-item strong { color: #fff; font-weight: 650; }
  .cmu-dot {
    flex: none;
    align-self: center;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.85;
  }
  .cmu-ts {
    flex: none;
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    background: var(--accent-soft);
    border: none;
    border-radius: 6px;
    padding: 1px 7px;
    font-family: inherit;
  }
  button.cmu-ts { cursor: pointer; }
  button.cmu-ts:hover { filter: brightness(1.35); }
  .cmu-text { flex: 1; }

  /* Provenance badge: where the recap came from (trust signal) */
  .cmu-source {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    font-weight: 600;
    padding: 6px 11px;
    border-radius: 9px;
    margin-bottom: 12px;
    border: 1px solid transparent;
  }
  .cmu-source-icon { flex: none; font-size: 12px; line-height: 1; }
  .cmu-src-grounded {
    color: #81c995;
    background: rgba(129, 201, 149, 0.12);
    border-color: rgba(129, 201, 149, 0.28);
  }
  .cmu-src-memory {
    color: #fdd663;
    background: rgba(253, 214, 99, 0.11);
    border-color: rgba(253, 214, 99, 0.30);
  }

  .cmu-muted { color: #9aa0a6; }
  .cmu-error { color: #f28b82; }
  .cmu-link {
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    background: none;
    border: none;
    font: inherit;
    padding: 0;
  }

  /* Skeleton loading */
  .cmu-skeleton { display: flex; flex-direction: column; gap: 14px; padding: 6px 2px; }
  .cmu-skeleton .cmu-bone {
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.06) 75%);
    background-size: 200% 100%;
    animation: cmu-shimmer 1.3s linear infinite;
  }
  .cmu-skeleton .cmu-bone:nth-child(2n)   { width: 92%; }
  .cmu-skeleton .cmu-bone:nth-child(3n)   { width: 78%; }
  .cmu-skeleton .cmu-bone:nth-child(3n+1) { width: 86%; }
  @keyframes cmu-shimmer { to { background-position: -200% 0; } }
  .cmu-loading-label {
    margin-top: 12px;
    text-align: center;
    font-size: 12.5px;
    color: #9aa0a6;
  }

  /* Follow-up Q&A thread (lives inside .cmu-body, scrolls with the recap) */
  .cmu-qa {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
  }
  .cmu-qa:empty { display: none; }
  .cmu-qa .cmu-turn { display: flex; flex-direction: column; gap: 6px; }
  .cmu-qa .cmu-turn::before {
    content: "";
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
    margin-bottom: 4px;
  }
  .cmu-q {
    align-self: flex-end;
    max-width: 88%;
    background: var(--accent-soft);
    color: #e8eaed;
    border-radius: 12px 12px 4px 12px;
    padding: 7px 11px;
    font-size: 13px;
  }
  .cmu-a {
    align-self: flex-start;
    max-width: 92%;
    color: #cdd0d4;
    padding: 2px 2px;
    white-space: pre-wrap;
    animation: cmu-item-in 0.3s ease both;
  }
  .cmu-a strong { color: #fff; font-weight: 650; }
  .cmu-a-pending {
    color: transparent;
    width: 42px;
    border-radius: 6px;
    background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.06) 75%);
    background-size: 200% 100%;
    animation: cmu-shimmer 1.3s linear infinite;
  }
  .cmu-a-error { color: #f28b82; }

  .cmu-ask {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .cmu-ask-input {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.05);
    color: #e8eaed;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    padding: 8px 12px;
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .cmu-ask-input::placeholder { color: #7c828b; }
  .cmu-ask-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .cmu-ask-input:disabled { opacity: 0.6; }
  .cmu-ask-send {
    flex: none;
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid transparent;
    border-radius: 9px;
    padding: 8px 12px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    font-family: inherit;
  }
  .cmu-ask-send:hover { filter: brightness(1.3); }
  .cmu-ask-send:disabled { opacity: 0.5; cursor: default; filter: none; }

  .cmu-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .cmu-btn {
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid transparent;
    border-radius: 9px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    font-family: inherit;
  }
  .cmu-btn:hover { filter: brightness(1.3); }
  .cmu-btn.cmu-secondary {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.12);
    color: #9aa0a6;
  }
  .cmu-btn.cmu-secondary:hover { color: #e8eaed; filter: none; border-color: rgba(255,255,255,0.25); }
`;
