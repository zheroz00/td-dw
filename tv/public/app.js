import { parseRecap, splitBold, formatTime, mediaHintFromParams } from './render.js';

// One page, two views. ?view=tv is what the remote button opens: big type, a
// fresh recap on load, and no inputs (nothing for a D-pad to get stuck in).
// Without it, it's the phone view: the latest recap, follow-up questions and a
// New recap button. The key comes from this page's own URL and goes to the API
// as a Bearer header.
const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
const IS_TV = params.get('view') === 'tv';

const $ = (id) => document.getElementById(id);

const BADGES = {
  transcript: { cls: 'grounded', text: 'Built from the subtitles' },
  knowledge: { cls: 'memory', text: "From the model's memory, may be imperfect" }
};

async function api(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body;
}

function appendRuns(el, runs) {
  for (const run of runs) {
    if (run.bold) {
      const strong = document.createElement('strong');
      strong.textContent = run.text;
      el.append(strong);
    } else {
      el.append(run.text);
    }
  }
}

// --- status line: loader, empty state or error --------------------------------

let loaderTimer = null;

function setStatus(text, kind) {
  const status = $('status');
  status.className = `status ${kind}`;
  status.textContent = text;
  status.hidden = false;
}

function showStatus(text, kind = 'info') {
  clearInterval(loaderTimer);
  loaderTimer = null;
  setStatus(text, kind);
}

// A thinking model can take a minute; a ticking counter shows it's alive.
function startLoader(label) {
  const started = Date.now();
  const tick = () => setStatus(`${label} ${Math.round((Date.now() - started) / 1000)}s`, 'loading');
  clearInterval(loaderTimer);
  tick();
  loaderTimer = setInterval(tick, 1000);
}

function hideStatus() {
  clearInterval(loaderTimer);
  loaderTimer = null;
  $('status').hidden = true;
}

// --- rendering ------------------------------------------------------------------

let current = null;

function clearRecap() {
  $('title').textContent = '';
  $('meta').textContent = '';
  $('recap').hidden = true;
  $('qa').hidden = true;
}

function renderHeader(rec) {
  $('title').textContent = rec.title;
  const at = `at ${formatTime(rec.positionSeconds)}${rec.durationSeconds ? ` of ${formatTime(rec.durationSeconds)}` : ''}`;
  const parts = [rec.episodeInfo, at, rec.fromResumePoint ? 'from your resume point' : null];
  $('meta').textContent = parts.filter(Boolean).join(' · ');
}

function bulletNode(bullet) {
  const li = document.createElement('li');
  if (bullet.time) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = bullet.time;
    li.append(chip);
  }
  const text = document.createElement('span');
  appendRuns(text, bullet.runs);
  li.append(text);
  return li;
}

function turnNodes(question, answer) {
  const q = document.createElement('p');
  q.className = 'question';
  q.textContent = question;
  const a = document.createElement('p');
  a.className = 'answer';
  if (answer === null) {
    a.classList.add('pending');
    a.textContent = 'Thinking...';
  } else {
    appendRuns(a, splitBold(answer));
  }
  return [q, a];
}

function renderRecap(rec) {
  current = rec;
  clearRecap();
  renderHeader(rec);
  const { result } = rec;

  if (!result.ok) return showStatus(result.error, 'error');
  if (!result.known) return showStatus(result.message, 'info');
  hideStatus();

  const badge = BADGES[result.source] || BADGES.knowledge;
  const sampled = result.source === 'transcript' && rec.transcriptTruncated ? ' (sampled to fit)' : '';
  $('badge').className = `badge ${badge.cls}`;
  $('badge').textContent = badge.text + sampled;
  $('note').textContent = rec.subtitleNote || '';
  $('note').hidden = !rec.subtitleNote;
  $('bullets').replaceChildren(...parseRecap(result.recapText).map(bulletNode));
  $('recap').hidden = false;

  if (!IS_TV) {
    $('thread').replaceChildren(...rec.history.flatMap((turn) => turnNodes(turn.question, turn.answer)));
    $('qa').hidden = false;
  }
}

// --- actions --------------------------------------------------------------------

async function newRecap() {
  const button = $('new-recap');
  button.disabled = true;
  clearRecap();
  startLoader('Catching you up...');
  try {
    // Only the TV app's link carries what's playing. No hint keeps the plain
    // POST (Jellyfin), and the phone view never sends one.
    const hint = IS_TV ? mediaHintFromParams(params) : null;
    renderRecap(await api('/api/recap', { method: 'POST', ...(hint && { body: JSON.stringify(hint) }) }));
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadLatest() {
  startLoader('Loading the latest recap...');
  try {
    renderRecap(await api('/api/latest'));
  } catch (err) {
    showStatus(err.message, 'info');
  }
}

function setAsking(busy) {
  $('ask-input').disabled = busy;
  $('ask-button').disabled = busy;
}

async function ask(event) {
  event.preventDefault();
  const input = $('ask-input');
  const question = input.value.trim();
  if (!question || !current) return;

  const [q, a] = turnNodes(question, null);
  $('thread').append(q, a);
  input.value = '';
  setAsking(true);
  try {
    const { answer } = await api('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ question, recapId: current.id })
    });
    a.className = 'answer';
    a.replaceChildren();
    appendRuns(a, splitBold(answer));
  } catch (err) {
    a.className = 'answer error';
    a.textContent = err.message;
  } finally {
    setAsking(false);
    input.focus();
  }
}

document.body.classList.toggle('tv', IS_TV);
if (IS_TV) {
  $('tv-hint').hidden = false;
  newRecap();
} else {
  $('new-recap').hidden = false;
  $('new-recap').addEventListener('click', newRecap);
  $('ask-form').addEventListener('submit', ask);
  loadLatest();
}
