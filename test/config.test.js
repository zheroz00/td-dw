import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for chrome.storage.local, reset before every test.
let store;
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
      set: async (items) => { Object.assign(store, structuredClone(items)); }
    }
  }
};
beforeEach(() => { store = {}; });

const { getConfig, saveConfig, endpointKey } = await import('../background/config.js');

const OPENROUTER = 'https://openrouter.ai/api/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MISTRAL = 'https://api.mistral.ai/v1';

test('endpointKey trims whitespace and trailing slashes', () => {
  assert.equal(endpointKey(' https://api.mistral.ai/v1/ '), MISTRAL);
  assert.equal(endpointKey(MISTRAL + '//'), MISTRAL);
  assert.equal(endpointKey(), '');
});

test('fresh install has no key', async () => {
  const config = await getConfig();
  assert.equal(config.apiKey, '');
  assert.deepEqual(config.apiKeys, {});
});

test('switching providers keeps each provider its own key', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1' });
  await saveConfig({ baseUrl: GEMINI, apiKey: 'gem-2' });
  await saveConfig({ baseUrl: MISTRAL + '/', apiKey: 'mis-3' });

  assert.equal((await getConfig()).apiKey, 'mis-3');
  await saveConfig({ baseUrl: OPENROUTER });
  assert.equal((await getConfig()).apiKey, 'sk-or-1');
  await saveConfig({ baseUrl: GEMINI });
  assert.equal((await getConfig()).apiKey, 'gem-2');
});

test('saving without apiKey leaves keys untouched', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1' });
  await saveConfig({ model: 'openrouter/free' });
  const config = await getConfig();
  assert.equal(config.apiKey, 'sk-or-1');
  assert.equal(config.model, 'openrouter/free');
});

test('an emptied key is removed, not stored', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1' });
  await saveConfig({ baseUrl: OPENROUTER, apiKey: '' });
  assert.deepEqual(store.catchMeUpConfig.apiKeys, {});
  assert.equal((await getConfig()).apiKey, '');
});

test('apiKeys map replaces the stored one and drops empty entries', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'old' });
  await saveConfig({ baseUrl: GEMINI, apiKeys: { [OPENROUTER]: 'new', [GEMINI]: '', '': 'x' }, apiKey: 'gem' });
  assert.deepEqual(store.catchMeUpConfig.apiKeys, { [OPENROUTER]: 'new', [GEMINI]: 'gem' });
});

test('the derived apiKey is never written to storage', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1' });
  assert.equal('apiKey' in store.catchMeUpConfig, false);
});

test('a v0.2.1 single key is adopted for its saved endpoint', async () => {
  store.catchMeUpConfig = { baseUrl: GEMINI + '/', apiKey: 'legacy', model: 'gemini-3.8-flash' };
  const config = await getConfig();
  assert.equal(config.apiKey, 'legacy');
  assert.deepEqual(config.apiKeys, { [GEMINI]: 'legacy' });

  // The first save migrates it into the map and drops the old field.
  await saveConfig({ summaryLength: 'short' });
  assert.deepEqual(store.catchMeUpConfig.apiKeys, { [GEMINI]: 'legacy' });
  assert.equal('apiKey' in store.catchMeUpConfig, false);
});

test('a legacy key never overrides a key already in the map', async () => {
  store.catchMeUpConfig = { baseUrl: OPENROUTER, apiKey: 'legacy', apiKeys: { [OPENROUTER]: 'current' } };
  assert.equal((await getConfig()).apiKey, 'current');
});
