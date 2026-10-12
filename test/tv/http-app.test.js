import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, MAX_QUESTION_CHARS } from '../../tv/lib/http-app.js';
import { createStore } from '../../tv/lib/store.js';
import { loadConfig } from '../../tv/lib/config.js';
import { NothingPlayingError } from '../../tv/lib/now-playing.js';
import { JellyfinError } from '../../tv/lib/jellyfin.js';

const KEY = 'abcdef0123456789abcdef';
const config = loadConfig({
  JELLYFIN_URL: 'http://jellyfin.local:8096',
  JELLYFIN_API_KEY: 'k',
  TDDW_TV_KEY: KEY,
  LLM_BASE_URL: 'http://llm.local/v1',
  LLM_MODEL: 'm'
});

// A throwaway public dir, so these tests don't depend on the real page.
const publicDir = await mkdtemp(join(tmpdir(), 'tddw-tv-'));
await writeFile(join(publicDir, 'index.html'), '<p>PAGE</p>');
await writeFile(join(publicDir, 'app.js'), '// app');
await writeFile(join(publicDir, 'render.js'), '// render');
await writeFile(join(publicDir, 'styles.css'), '/* css */');
after(() => rm(publicDir, { recursive: true, force: true }));

const RECORD = {
  id: 'r1',
  createdAt: '2026-10-12T10:00:00.000Z',
  videoState: {
    service: 'Jellyfin',
    title: 'Matchbox',
    episodeInfo: null,
    currentTimeSeconds: 2521,
    durationSeconds: 6000,
    transcript: { text: 'SECRET TRANSCRIPT', truncated: true }
  },
  result: { ok: true, known: true, recapText: '- hi', source: 'transcript' },
  fromResumePoint: false,
  subtitleNote: null,
  history: []
};

async function startApp({ runRecap = async () => structuredClone(RECORD), ask = async () => 'An answer.' } = {}) {
  const store = createStore(runRecap);
  const app = createApp({ config, store, recapService: { ask }, publicDir, log: { error() {} } });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { key = KEY, body, method = body === undefined ? 'GET' : 'POST' } = {}) =>
    fetch(base + path, {
      method,
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
  return { store, base, call, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('http: /healthz needs no key', async () => {
  const app = await startApp();
  const res = await app.call('/healthz', { key: null });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await app.close();
});

test('http: /favicon.ico answers 204 without a key, so browsers stop logging a 401', async () => {
  const app = await startApp();
  const res = await app.call('/favicon.ico', { key: null });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  await app.close();
});

test('http: the page needs the key and carries the security headers', async () => {
  const app = await startApp();
  assert.equal((await fetch(`${app.base}/`)).status, 401);
  const res = await fetch(`${app.base}/?view=tv&key=${KEY}`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /PAGE/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  await app.close();
});

test('http: static files are an allow-list', async () => {
  const app = await startApp();
  const js = await fetch(`${app.base}/static/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`${app.base}/static/index.html`)).status, 404);
  assert.equal((await fetch(`${app.base}/static/%2e%2e%2fserver.js`)).status, 404);
  await app.close();
});

test('http: API calls need the right key', async () => {
  const app = await startApp();
  assert.equal((await app.call('/api/recap', { method: 'POST', key: null })).status, 401);
  assert.equal((await app.call('/api/recap', { method: 'POST', key: 'wrong-key-wrong-key' })).status, 401);
  await app.close();
});

test('http: POST /api/recap returns the recap without the transcript', async () => {
  const app = await startApp();
  const res = await app.call('/api/recap', { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 'r1');
  assert.equal(body.title, 'Matchbox');
  assert.equal(body.positionSeconds, 2521);
  assert.equal(body.transcriptTruncated, true);
  assert.deepEqual(body.result, RECORD.result);
  assert.ok(!JSON.stringify(body).includes('SECRET TRANSCRIPT'));
  await app.close();
});

test('http: GET /api/latest is a 404 until the first recap', async () => {
  const app = await startApp();
  const res = await app.call('/api/latest');
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /No recap yet/);
  await app.call('/api/recap', { method: 'POST' });
  assert.equal((await (await app.call('/api/latest')).json()).id, 'r1');
  await app.close();
});

test('http: recap errors become readable statuses', async () => {
  let app = await startApp({ runRecap: async () => { throw new NothingPlayingError('SHIELD'); } });
  let res = await app.call('/api/recap', { method: 'POST' });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /Nothing is playing in Jellyfin on "SHIELD"/);
  await app.close();

  app = await startApp({ runRecap: async () => { throw new JellyfinError('Jellyfin rejected the API key. Check JELLYFIN_API_KEY.', 401); } });
  res = await app.call('/api/recap', { method: 'POST' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /rejected the API key/);
  await app.close();
});

test('http: /api/ask validates the question', async () => {
  const app = await startApp();
  const noRecap = await app.call('/api/ask', { body: { question: 'Who?' } });
  assert.equal(noRecap.status, 409);
  assert.equal((await noRecap.json()).error, 'There is no recap to ask about yet.');
  await app.call('/api/recap', { method: 'POST' });
  assert.equal((await app.call('/api/ask', { body: { question: '   ' } })).status, 400);
  assert.equal((await app.call('/api/ask', { body: { question: 'x'.repeat(MAX_QUESTION_CHARS + 1) } })).status, 400);
  assert.equal((await app.call('/api/ask', { body: 'not json' })).status, 400);
  assert.equal((await app.call('/api/ask', { body: 'null' })).status, 400);
  assert.equal((await app.call('/api/ask', { body: { question: 'x'.repeat(17 * 1024) } })).status, 413);
  await app.close();
});

test('http: /api/ask refuses a question about a replaced recap', async () => {
  const app = await startApp();
  await app.call('/api/recap', { method: 'POST' });
  const res = await app.call('/api/ask', { body: { question: 'Who?', recapId: 'an-older-recap' } });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /newer recap replaced this one/);
  await app.close();
});

test('http: /api/ask refuses when the recap has no content to ask about', async () => {
  const app = await startApp({ runRecap: async () => ({ ...structuredClone(RECORD), result: { ok: true, known: false, message: 'Unknown title.' } }) });
  await app.call('/api/recap', { method: 'POST' });
  const res = await app.call('/api/ask', { body: { question: 'Who?' } });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "The latest recap didn't work, so there's nothing to ask about. Press New recap.");
  await app.close();
});

test('http: /api/ask answers and records the turn', async () => {
  const app = await startApp();
  await app.call('/api/recap', { method: 'POST' });
  const res = await app.call('/api/ask', { body: { question: ' Who is Mark? ', recapId: 'r1' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: 'An answer.' });
  const latest = await (await app.call('/api/latest')).json();
  assert.deepEqual(latest.history, [{ question: 'Who is Mark?', answer: 'An answer.' }]);
  await app.close();
});

test('http: unknown routes are 404', async () => {
  const app = await startApp();
  assert.equal((await app.call('/api/nope')).status, 404);
  await app.close();
});

// fetch normalises the path, so a raw socket is the only way to send `//`.
function rawRequest(port, requestLine) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    socket.on('connect', () => socket.write(`${requestLine}\r\nHost: x\r\nConnection: close\r\n\r\n`));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.setTimeout(2000, () => socket.destroy(new Error('no response from the server')));
    socket.on('error', reject);
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

test('http: a malformed request target is a 400, not a crash', async () => {
  const app = await startApp();
  const port = new URL(app.base).port;
  for (const target of ['//', '//[', '//x:99999/y']) {
    const raw = await rawRequest(port, `GET ${target} HTTP/1.1`);
    assert.match(raw, /^HTTP\/1\.1 400 /, target);
    assert.match(raw, /Bad request\./);
    assert.match(raw.toLowerCase(), /referrer-policy: no-referrer/);
  }
  // Still serving afterwards.
  assert.equal((await fetch(`${app.base}/healthz`)).status, 200);
  await app.close();
});
