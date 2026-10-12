import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJellyfinClient, JellyfinError } from '../../tv/lib/jellyfin.js';
import { fakeFetch } from './fakes.js';

const J = { url: 'http://jellyfin.local:8096', apiKey: 'jf-key' };
const BASE = 'http://jellyfin.local:8096';

test('jellyfin: sends the key in the MediaBrowser Authorization header', async () => {
  const f = fakeFetch({ [`GET ${BASE}/Sessions`]: [] });
  assert.deepEqual(await createJellyfinClient(J, f).getSessions(), []);
  assert.equal(f.calls[0].headers.Authorization, 'MediaBrowser Token="jf-key"');
});

test('jellyfin: keeps a sub-path in the base URL', async () => {
  const f = fakeFetch({ 'GET https://example.com/jellyfin/Sessions': [] });
  await createJellyfinClient({ url: 'https://example.com/jellyfin', apiKey: 'k' }, f).getSessions();
  assert.equal(f.calls[0].url, 'https://example.com/jellyfin/Sessions');
});

test('jellyfin: item, resume point and subtitle calls hit the right paths', async () => {
  const f = fakeFetch({
    [`GET ${BASE}/Items/item1?userId=user1`]: { Id: 'item1' },
    [`GET ${BASE}/UserItems/Resume?userId=user1&limit=1&mediaTypes=Video`]: { Items: [{ Id: 'r1' }] },
    [`GET ${BASE}/Videos/item1/src1/Subtitles/3/Stream.vtt`]: 'WEBVTT'
  });
  const jf = createJellyfinClient(J, f);
  assert.deepEqual(await jf.getItem('user1', 'item1'), { Id: 'item1' });
  assert.deepEqual(await jf.getResumeItem('user1'), { Id: 'r1' });
  assert.equal(await jf.getSubtitleVtt('item1', 'src1', 3), 'WEBVTT');
});

test('jellyfin: getResumeItem is null when nothing is in progress', async () => {
  const f = fakeFetch({ [`GET ${BASE}/UserItems/Resume?userId=u&limit=1&mediaTypes=Video`]: { Items: [] } });
  assert.equal(await createJellyfinClient(J, f).getResumeItem('u'), null);
});

test('jellyfin: pause POSTs to the session', async () => {
  const f = fakeFetch({ [`POST ${BASE}/Sessions/s1/Playing/Pause`]: { status: 204 } });
  await createJellyfinClient(J, f).pause('s1');
  assert.equal(f.calls[0].method, 'POST');
});

test('jellyfin: a 401 becomes a readable API-key error', async () => {
  const f = fakeFetch({ [`GET ${BASE}/Sessions`]: { status: 401 } });
  await assert.rejects(createJellyfinClient(J, f).getSessions(), (err) => {
    assert.ok(err instanceof JellyfinError);
    assert.equal(err.status, 401);
    assert.match(err.message, /rejected the API key/);
    assert.ok(!err.message.includes('jf-key'));
    return true;
  });
});

test('jellyfin: a network failure says it cannot reach the server', async () => {
  const f = fakeFetch({ [`GET ${BASE}/Sessions`]: new Error('ECONNREFUSED') });
  await assert.rejects(createJellyfinClient(J, f).getSessions(), /Can't reach Jellyfin at http:\/\/jellyfin\.local:8096/);
});

test('jellyfin: other failures name the path but not the query string', async () => {
  await assert.rejects(createJellyfinClient(J, fakeFetch({})).getItem('u', 'i'), /GET \/Items\/i failed \(404\)/);
});

test('jellyfin: a network failure shows the underlying error code, not just "fetch failed"', async () => {
  const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const f = fakeFetch({ [`GET ${BASE}/Sessions`]: err });
  await assert.rejects(createJellyfinClient(J, f).getSessions(), (e) => {
    assert.ok(e instanceof JellyfinError);
    assert.match(e.message, /ECONNREFUSED/);
    assert.ok(!e.message.includes('fetch failed'));
    return true;
  });
});

test('jellyfin: a 200 that is not JSON points at JELLYFIN_URL instead of leaking a parse error', async () => {
  const f = fakeFetch({ [`GET ${BASE}/Sessions`]: '<!DOCTYPE html><html></html>' });
  await assert.rejects(createJellyfinClient(J, f).getSessions(), (err) => {
    assert.ok(err instanceof JellyfinError);
    assert.equal(err.status, 200);
    assert.match(err.message, /isn't JSON/);
    assert.match(err.message, /JELLYFIN_URL/);
    assert.ok(!/Unexpected token|SyntaxError/.test(err.message));
    return true;
  });
});
