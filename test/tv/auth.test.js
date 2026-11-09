import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorized, keyMatches } from '../../tv/lib/auth.js';

const KEY = 'abcdef0123456789abcdef';
const req = (headers = {}) => ({ headers });
const url = (query = '') => new URL(`http://tv.local/${query}`);

test('isAuthorized: accepts the key as a Bearer header', () => {
  assert.equal(isAuthorized(req({ authorization: `Bearer ${KEY}` }), url(), KEY), true);
});

test('isAuthorized: accepts the key as ?key=', () => {
  assert.equal(isAuthorized(req(), url(`?key=${KEY}`), KEY), true);
});

test('isAuthorized: rejects a wrong or missing key', () => {
  assert.equal(isAuthorized(req(), url(), KEY), false);
  assert.equal(isAuthorized(req({ authorization: 'Bearer nope' }), url('?key=nope'), KEY), false);
  assert.equal(isAuthorized(req({ authorization: KEY }), url(), KEY), false);
});

test('keyMatches: empty values and different lengths never match', () => {
  assert.equal(keyMatches('', ''), false);
  assert.equal(keyMatches(undefined, KEY), false);
  assert.equal(keyMatches(KEY.slice(0, -1), KEY), false);
  assert.equal(keyMatches(KEY, KEY), true);
});
