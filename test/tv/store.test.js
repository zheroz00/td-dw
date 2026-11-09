import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, MAX_HISTORY } from '../../tv/lib/store.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const record = (id) => ({ id, history: [] });

test('store: latest() is null before any recap', async () => {
  assert.equal(await createStore(async () => record('a')).latest(), null);
});

test('store: a second recap() while one runs joins it', async () => {
  let runs = 0;
  const d = deferred();
  const store = createStore(() => { runs++; return d.promise; });
  const first = store.recap();
  const second = store.recap();
  assert.equal(first, second);
  assert.equal(store.isRunning(), true);
  d.resolve(record('a'));
  assert.equal((await first).id, 'a');
  assert.equal(runs, 1);
  assert.equal(store.isRunning(), false);
});

test('store: latest() waits for a running recap', async () => {
  const d = deferred();
  const store = createStore(() => d.promise);
  store.recap();
  const pending = store.latest();
  d.resolve(record('b'));
  assert.equal((await pending).id, 'b');
});

test('store: a failed recap rejects its caller and keeps the previous one', async () => {
  let n = 0;
  const store = createStore(async () => {
    n++;
    if (n === 2) throw new Error('LLM down');
    return record(`r${n}`);
  });
  await store.recap();
  await assert.rejects(store.recap(), /LLM down/);
  assert.equal((await store.latest()).id, 'r1');
  assert.equal((await store.recap()).id, 'r3');
});

test('store: addTurn only touches the matching recap', async () => {
  const store = createStore(async () => record('a'));
  await store.recap();
  assert.equal(store.addTurn('stale', 'q', 'a'), false);
  assert.equal(store.addTurn('a', 'Who?', 'Him.'), true);
  assert.deepEqual((await store.latest()).history, [{ question: 'Who?', answer: 'Him.' }]);
});

test('store: the thread keeps only the newest MAX_HISTORY turns', async () => {
  const store = createStore(async () => record('a'));
  await store.recap();
  for (let i = 0; i < MAX_HISTORY + 5; i++) store.addTurn('a', `q${i}`, `a${i}`);
  const { history } = await store.latest();
  assert.equal(history.length, MAX_HISTORY);
  assert.equal(history[0].question, 'q5');
});

test('store: a synchronous throw from runRecap does not wedge the store', async () => {
  let n = 0;
  const store = createStore(() => {
    n++;
    if (n === 1) throw new Error('sync boom');
    return Promise.resolve(record('ok'));
  });
  await assert.rejects(store.recap(), /sync boom/);
  assert.equal(store.isRunning(), false);
  assert.equal((await store.recap()).id, 'ok');
  assert.equal(n, 2);
});

test('store: a reader waiting on a failing run gets the previous recap', async () => {
  let n = 0;
  const d = deferred();
  const store = createStore(() => (++n === 1 ? Promise.resolve(record('r1')) : d.promise));
  await store.recap();
  const failing = store.recap();
  const reader = store.latest();
  d.reject(new Error('LLM down'));
  await assert.rejects(failing, /LLM down/);
  assert.equal((await reader).id, 'r1');
});

test('store: recap(hint) hands the hint to runRecap, and none means null', async () => {
  const seen = [];
  const store = createStore(async (hint) => { seen.push(hint); return record('a'); });
  const hint = { nowPlaying: null, mediaAccess: false };
  await store.recap(hint);
  await store.recap();
  assert.deepEqual(seen, [hint, null]);
});

test('store: a request joining a running recap ignores its own hint', async () => {
  const seen = [];
  const d = deferred();
  const store = createStore((hint) => { seen.push(hint); return d.promise; });
  const first = store.recap({ mediaAccess: false });
  const second = store.recap({ nowPlaying: { app: 'com.netflix.ninja' } });
  assert.equal(first, second);
  d.resolve(record('a'));
  await first;
  assert.deepEqual(seen, [{ mediaAccess: false }]);
});
