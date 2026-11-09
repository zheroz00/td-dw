import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeClient, collectVideos, normalize } from '../../tv/lib/youtube.js';
import { fakeFetch } from './fakes.js';

const SEARCH = 'POST https://www.youtube.com/youtubei/v1/search?prettyPrint=false';

const video = (videoId, title, channel, length) => ({
  videoRenderer: {
    videoId,
    title: { runs: title.split('|').map((text) => ({ text })) },
    ownerText: { runs: [{ text: channel }] },
    ...(length ? { lengthText: { simpleText: length } } : {})
  }
});

// The real response nests renderers several levels down, inside shelves.
const response = (...videos) => ({
  contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [{ shelfRenderer: {} }, ...videos] } }
  ] } } } }
});

const clientFor = (...videos) => {
  const fetchImpl = fakeFetch({ [SEARCH]: response(...videos) });
  return { fetchImpl, yt: createYouTubeClient({ fetchImpl, fetchTranscript: async () => null }) };
};

const TITLE = 'Why Egypt Guards This River With an Army';

test('normalize: case, spacing and unicode forms', () => {
  assert.equal(normalize('  Ｈello   WORLD '), 'hello world');
  assert.equal(normalize(null), '');
});

test('collectVideos: finds renderers at any depth and reads their fields', () => {
  const [v] = collectVideos(response({
    videoRenderer: {
      videoId: 'abc',
      title: { runs: [{ text: 'Part ' }, { text: 'one' }] },
      longBylineText: { runs: [{ text: 'Chan' }] },
      lengthText: { simpleText: '1:02:03' }
    }
  }));
  assert.deepEqual(v, { id: 'abc', title: 'Part one', channel: 'Chan', lengthSeconds: 3723 });
});

test('findVideo: posts the search to the InnerTube endpoint and returns the exact match', async () => {
  const { fetchImpl, yt } = clientFor(video('20CgG5pUv9Q', TITLE, 'Johnny Harris', '21:05'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), '20CgG5pUv9Q');
  assert.equal(fetchImpl.calls.length, 1);
});

test('findVideo: sends the query, client context and video-only filter', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, init };
    return Response.json(response());
  };
  await createYouTubeClient({ fetchImpl }).findVideo('A title', 'A channel', null);
  assert.equal(sent.url, 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false');
  assert.equal(sent.init.method, 'POST');
  const body = JSON.parse(sent.init.body);
  assert.equal(body.query, 'A title A channel');
  assert.equal(body.params, 'EgIQAQ==');
  assert.deepEqual(body.context, { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en' } });
  assert.ok(sent.init.signal);
});

test('findVideo: a reupload with the same title on another channel is rejected', async () => {
  const { yt } = clientFor(video('REUPLOAD', TITLE, 'Some Reuploader', '21:05'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', 1265), null);
});

test('findVideo: the right channel is picked past a lookalike', async () => {
  const { yt } = clientFor(video('REUPLOAD', TITLE, 'Some Reuploader'), video('REAL', TITLE, 'Johnny Harris'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), 'REAL');
});

test('findVideo: a near-miss title is not a match', async () => {
  const { yt } = clientFor(video('X', `${TITLE} (Part 2)`, 'Johnny Harris'), video('Y', 'Why Egypt Guards This River', 'Johnny Harris'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), null);
});

test('findVideo: matching ignores case, spacing and unicode forms', async () => {
  const { yt } = clientFor(video('NORM', '  why EGYPT guards this river   with an army ', 'JOHNNY  harris'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), 'NORM');
  const full = clientFor(video('FULL', 'Ｈello Ｗorld', 'Ｃhan'));
  assert.equal(await full.yt.findVideo('Hello World', 'Chan', null), 'FULL');
});

test('findVideo: title runs are joined before matching', async () => {
  const { yt } = clientFor(video('RUNS', 'Why Egypt Guards This River| With an Army', 'Johnny Harris'));
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), 'RUNS');
});

test('findVideo: several matches go to the nearest length, else the first', async () => {
  const { yt } = clientFor(
    video('SHORT', TITLE, 'Johnny Harris', '1:00'),
    video('LONG', TITLE, 'Johnny Harris', '21:05'),
    video('NOLEN', TITLE, 'Johnny Harris')
  );
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', 1270), 'LONG');
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', 50), 'SHORT');
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), 'SHORT');
});

test('findVideo: no results means null', async () => {
  const { yt } = clientFor();
  assert.equal(await yt.findVideo(TITLE, 'Johnny Harris', null), null);
});

test('findVideo: no channel means no lookup and no match', async () => {
  const { fetchImpl, yt } = clientFor(video('X', TITLE, 'Johnny Harris'));
  assert.equal(await yt.findVideo(TITLE, null, null), null);
  assert.equal(await yt.findVideo(TITLE, '  ', null), null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('findVideo: a non-2xx throws', async () => {
  const yt = createYouTubeClient({ fetchImpl: fakeFetch({ [SEARCH]: { status: 429 } }) });
  await assert.rejects(yt.findVideo(TITLE, 'Johnny Harris', null), /YouTube search failed \(429\)/);
});

test('findVideo: a network failure throws with the reason', async () => {
  const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const yt = createYouTubeClient({ fetchImpl: fakeFetch({ [SEARCH]: err }) });
  await assert.rejects(yt.findVideo(TITLE, 'Johnny Harris', null), /ENOTFOUND/);
});

test('findVideo: gives up after the timeout', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  });
  const yt = createYouTubeClient({ fetchImpl, timeoutMs: 20 });
  await assert.rejects(yt.findVideo(TITLE, 'Johnny Harris', null), /timed out/);
});

test('getTranscript: passes the id and cutoff through and returns the result', async () => {
  const seen = [];
  const captions = { lines: ['[0:01] hi'], language: 'en', autoGenerated: false };
  const yt = createYouTubeClient({ fetchTranscript: async (...args) => { seen.push(args); return captions; } });
  assert.equal(await yt.getTranscript('abc', 5000), captions);
  assert.deepEqual(seen, [['abc', 5000]]);
});

test('getTranscript: null (no captions) comes through, errors reject', async () => {
  assert.equal(await createYouTubeClient({ fetchTranscript: async () => null }).getTranscript('abc', 1), null);
  const failing = createYouTubeClient({ fetchTranscript: async () => { throw new Error('innertube player failed (403)'); } });
  await assert.rejects(failing.getTranscript('abc', 1), /innertube player failed \(403\)/);
});

test('getTranscript: a hung caption fetch times out', async () => {
  const yt = createYouTubeClient({ fetchTranscript: () => new Promise(() => {}), timeoutMs: 20 });
  await assert.rejects(yt.getTranscript('abc', 1), /captions timed out/);
});
