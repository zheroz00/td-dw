import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNowPlaying, NothingPlayingError } from '../../tv/lib/now-playing.js';

function fakeJellyfin({ sessions = [], resume = null } = {}) {
  const calls = [];
  return {
    calls,
    async getSessions() { return sessions; },
    async getItem(userId, itemId) { calls.push(`getItem ${userId} ${itemId}`); return { Id: itemId }; },
    async getResumeItem(userId) { calls.push(`getResumeItem ${userId}`); return resume; }
  };
}

const tv = (overrides = {}) => ({
  Id: 's-tv',
  UserId: 'u1',
  DeviceName: 'SHIELD Android TV',
  Client: 'Android TV',
  LastActivityDate: '2026-10-12T10:00:00Z',
  NowPlayingItem: { Id: 'movie1', MediaType: 'Video' },
  PlayState: { PositionTicks: 2521 * 1e7, MediaSourceId: 'src-b' },
  ...overrides
});

const phone = (overrides = {}) => tv({
  Id: 's-phone',
  UserId: 'u2',
  DeviceName: 'Pixel 9',
  Client: 'Jellyfin Web',
  NowPlayingItem: { Id: 'show1', MediaType: 'Video' },
  ...overrides
});

test('findNowPlaying: uses the live session, its position and its media source', async () => {
  const jf = fakeJellyfin({ sessions: [tv()] });
  const now = await findNowPlaying(jf, null);
  assert.deepEqual(now, {
    sessionId: 's-tv',
    userId: 'u1',
    item: { Id: 'movie1' },
    mediaSourceId: 'src-b',
    positionSeconds: 2521,
    fromResumePoint: false
  });
  assert.deepEqual(jf.calls, ['getItem u1 movie1']);
});

test('findNowPlaying: the device filter matches DeviceName or Client, any case', async () => {
  const sessions = [phone({ LastActivityDate: '2026-10-12T11:00:00Z' }), tv()];
  assert.equal((await findNowPlaying(fakeJellyfin({ sessions }), 'shield')).sessionId, 's-tv');
  assert.equal((await findNowPlaying(fakeJellyfin({ sessions }), 'android tv')).sessionId, 's-tv');
});

test('findNowPlaying: without a filter the most recently active session wins', async () => {
  const sessions = [tv(), phone({ LastActivityDate: '2026-10-12T11:00:00Z' })];
  assert.equal((await findNowPlaying(fakeJellyfin({ sessions }), null)).sessionId, 's-phone');
});

test('findNowPlaying: music does not count as playing', async () => {
  const jf = fakeJellyfin({
    sessions: [tv({ NowPlayingItem: { Id: 'song', MediaType: 'Audio' } })],
    resume: { Id: 'ep2', UserData: { PlaybackPositionTicks: 600 * 1e7 } }
  });
  assert.equal((await findNowPlaying(jf, null)).fromResumePoint, true);
});

test('findNowPlaying: a missing position counts as the start', async () => {
  const now = await findNowPlaying(fakeJellyfin({ sessions: [tv({ PlayState: {} })] }), null);
  assert.equal(now.positionSeconds, 0);
  assert.equal(now.mediaSourceId, null);
});

test('findNowPlaying: falls back to the resume point when nothing is live', async () => {
  const jf = fakeJellyfin({
    sessions: [tv({ NowPlayingItem: undefined, PlayState: {} })],
    resume: { Id: 'ep2', UserData: { PlaybackPositionTicks: 600 * 1e7 } }
  });
  const now = await findNowPlaying(jf, 'SHIELD');
  assert.deepEqual(now, {
    sessionId: null,
    userId: 'u1',
    item: { Id: 'ep2' },
    mediaSourceId: null,
    positionSeconds: 600,
    fromResumePoint: true
  });
  assert.deepEqual(jf.calls, ['getResumeItem u1', 'getItem u1 ep2']);
});

test('findNowPlaying: nothing live and no resume point is a NothingPlayingError', async () => {
  await assert.rejects(findNowPlaying(fakeJellyfin(), null), NothingPlayingError);
  await assert.rejects(
    findNowPlaying(fakeJellyfin({ sessions: [tv({ NowPlayingItem: undefined })] }), 'SHIELD'),
    /Nothing is playing in Jellyfin on "SHIELD"/
  );
});
