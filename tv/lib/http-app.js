import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isAuthorized } from './auth.js';
import { JellyfinError } from './jellyfin.js';
import { NothingPlayingError } from './now-playing.js';
import { parseMediaHint, MediaHintError } from './media-hint.js';

// HTTP layer: routing, the key check, body limits and security headers. The
// recap work lives in the store and recap service passed in, so tests drive
// this with fakes.

const MAX_BODY_BYTES = 16 * 1024;
export const MAX_QUESTION_CHARS = 2000;

const STATIC_FILES = {
  'app.js': 'text/javascript; charset=utf-8',
  'render.js': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8'
};

// The key rides in the page URL, so it must never leak in a Referer header.
// The page only loads its own files, so everything else is locked out.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store'
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function send(res, status, body, contentType) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': contentType });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

// Reads the whole body even when it's too large (discarding the excess), so
// the 413 can still be sent. Bailing out of a `for await` loop instead would
// destroy the request, and with it the socket the response needs.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request body is too large.'));
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return reject(new HttpError(400, 'Request body must be JSON.'));
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reject(new HttpError(400, 'Request body must be a JSON object.'));
      }
      resolve(body);
    });
  });
}

// What the page needs from a stored recap. The transcript stays on the server:
// it can be hundreds of KB and the page never shows it.
export function toClient(record) {
  const { videoState, result } = record;
  return {
    id: record.id,
    createdAt: record.createdAt,
    title: videoState.title,
    episodeInfo: videoState.episodeInfo,
    positionSeconds: videoState.currentTimeSeconds,
    durationSeconds: videoState.durationSeconds,
    transcriptTruncated: !!videoState.transcript?.truncated,
    fromResumePoint: record.fromResumePoint,
    subtitleNote: record.subtitleNote,
    result,
    history: record.history
  };
}

function statusFor(err) {
  if (err instanceof HttpError) return err.status;
  if (err instanceof MediaHintError) return 400;
  if (err instanceof NothingPlayingError) return 404;
  if (err instanceof JellyfinError) return 502;
  return 500;
}

export function createApp({ config, store, recapService, publicDir, log = console }) {
  async function serveFile(res, name, contentType) {
    send(res, 200, await readFile(join(publicDir, name)), contentType);
  }

  async function route(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/healthz') return sendJson(res, 200, { ok: true });

    // Browsers ask for this on their own, without the key. There is no icon, so
    // say so quietly instead of logging a 401 in the console on every load.
    if (method === 'GET' && pathname === '/favicon.ico') return send(res, 204, '', 'text/plain; charset=utf-8');

    if (method === 'GET' && pathname.startsWith('/static/')) {
      const name = pathname.slice('/static/'.length);
      // An allow-list, never a path join on user input: nothing else in public/ is reachable.
      if (!Object.hasOwn(STATIC_FILES, name)) throw new HttpError(404, 'Not found.');
      return serveFile(res, name, STATIC_FILES[name]);
    }

    if (!isAuthorized(req, url, config.tvKey)) {
      throw new HttpError(401, 'Missing or wrong key. Open the full link from your setup, including ?key=');
    }

    if (method === 'GET' && pathname === '/') {
      return serveFile(res, 'index.html', 'text/html; charset=utf-8');
    }

    if (method === 'POST' && pathname === '/api/recap') {
      // Phone and browser recaps send no body; the TV app sends what it sees playing.
      const hint = parseMediaHint(await readJson(req));
      return sendJson(res, 200, toClient(await store.recap(hint)));
    }

    if (method === 'GET' && pathname === '/api/latest') {
      const record = await store.latest();
      if (!record) throw new HttpError(404, 'No recap yet. Press New recap.');
      return sendJson(res, 200, toClient(record));
    }

    if (method === 'POST' && pathname === '/api/ask') {
      const body = await readJson(req);
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      if (!question) throw new HttpError(400, 'Type a question first.');
      if (question.length > MAX_QUESTION_CHARS) {
        throw new HttpError(400, `Keep questions under ${MAX_QUESTION_CHARS} characters.`);
      }

      const record = await store.latest();
      if (!record) throw new HttpError(409, 'There is no recap to ask about yet.');
      if (!record.result?.ok || !record.result.known) {
        throw new HttpError(409, "The latest recap didn't work, so there's nothing to ask about. Press New recap.");
      }
      if (body.recapId && body.recapId !== record.id) {
        throw new HttpError(409, 'A newer recap replaced this one. Reload the page to ask about it.');
      }

      const answer = await recapService.ask(record, question);
      store.addTurn(record.id, question, answer);
      return sendJson(res, 200, { answer });
    }

    throw new HttpError(404, 'Not found.');
  }

  return async function handle(req, res) {
    // The parser accepts targets like `//` that the URL parser rejects. Handled
    // here, before auth, so one bad request line can't become an unhandled
    // rejection that takes the whole service down.
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, 'Bad request.', 'text/plain; charset=utf-8');
    }

    try {
      await route(req, res, url);
    } catch (err) {
      const status = statusFor(err);
      if (status >= 500) log.error(`[tv] ${req.method} ${url.pathname} failed: ${err.stack || err.message}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const message = err.message || 'Something went wrong.';
      if (url.pathname.startsWith('/api/')) sendJson(res, status, { error: message });
      else send(res, status, message, 'text/plain; charset=utf-8');
    }
  };
}
