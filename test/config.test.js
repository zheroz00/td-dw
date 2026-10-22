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

const { getConfig, saveConfig, endpointKey, DEFAULTS } = await import('../background/config.js');

const pick = ({ apiKey, model }) => ({ apiKey, model });

const OPENROUTER = 'https://openrouter.ai/api/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MISTRAL = 'https://api.mistral.ai/v1';

test('endpointKey trims whitespace and trailing slashes', () => {
  assert.equal(endpointKey(' https://api.mistral.ai/v1/ '), MISTRAL);
  assert.equal(endpointKey(MISTRAL + '//'), MISTRAL);
  assert.equal(endpointKey(), '');
});

test('fresh install has no key and the default model', async () => {
  const config = await getConfig();
  assert.equal(config.apiKey, '');
  assert.equal(config.model, DEFAULTS.model);
  assert.deepEqual(config.endpoints, {});
});

test('switching providers keeps each provider its own key and model', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1', model: 'openrouter/free' });
  await saveConfig({ baseUrl: GEMINI, apiKey: 'gem-2', model: 'gemini-3.8-flash' });
  await saveConfig({ baseUrl: MISTRAL + '/', apiKey: 'mis-3', model: 'mistral-large-latest' });

  assert.equal((await getConfig()).model, 'mistral-large-latest');
  await saveConfig({ baseUrl: OPENROUTER });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'sk-or-1', model: 'openrouter/free' });
  await saveConfig({ baseUrl: GEMINI });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'gem-2', model: 'gemini-3.8-flash' });
});

test('an endpoint with a key but no model gets the default model', async () => {
  await saveConfig({ baseUrl: MISTRAL, apiKey: 'mis-3' });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'mis-3', model: DEFAULTS.model });
});

test('saving only one of key/model leaves the other untouched', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1', model: 'a' });
  await saveConfig({ model: 'b' });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'sk-or-1', model: 'b' });
  await saveConfig({ apiKey: 'sk-or-2' });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'sk-or-2', model: 'b' });
  await saveConfig({ summaryLength: 'short' });
  assert.deepEqual(pick(await getConfig()), { apiKey: 'sk-or-2', model: 'b' });
});

test('emptied values are removed, and an emptied entry with them', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1', model: 'a' });
  await saveConfig({ baseUrl: OPENROUTER, apiKey: '' });
  assert.deepEqual(store.catchMeUpConfig.endpoints, { [OPENROUTER]: { model: 'a' } });
  await saveConfig({ baseUrl: OPENROUTER, model: '' });
  assert.deepEqual(store.catchMeUpConfig.endpoints, {});
});

test('an endpoints map replaces the stored one and drops empty entries', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'old' });
  await saveConfig({
    baseUrl: GEMINI,
    endpoints: { [OPENROUTER]: { apiKey: 'new', model: 'm' }, [GEMINI]: { apiKey: '' }, '': { apiKey: 'x' } },
    apiKey: 'gem',
    model: 'g'
  });
  assert.deepEqual(store.catchMeUpConfig.endpoints, {
    [OPENROUTER]: { apiKey: 'new', model: 'm' },
    [GEMINI]: { apiKey: 'gem', model: 'g' }
  });
});

test('the derived apiKey and model are never written to storage', async () => {
  await saveConfig({ baseUrl: OPENROUTER, apiKey: 'sk-or-1', model: 'a' });
  assert.equal('apiKey' in store.catchMeUpConfig, false);
  assert.equal('model' in store.catchMeUpConfig, false);
});

test('a v0.2.1 single key and model are adopted for their saved endpoint', async () => {
  store.catchMeUpConfig = { baseUrl: GEMINI + '/', apiKey: 'legacy', model: 'gemini-3.8-flash' };
  const config = await getConfig();
  assert.deepEqual(pick(config), { apiKey: 'legacy', model: 'gemini-3.8-flash' });
  assert.deepEqual(config.endpoints, { [GEMINI]: { apiKey: 'legacy', model: 'gemini-3.8-flash' } });

  // The first save migrates them into the map and drops the old fields.
  await saveConfig({ summaryLength: 'short' });
  const { model: _defaultModel, ...storedDefaults } = DEFAULTS;
  assert.deepEqual(store.catchMeUpConfig, {
    ...storedDefaults,
    baseUrl: GEMINI + '/',
    summaryLength: 'short',
    endpoints: { [GEMINI]: { apiKey: 'legacy', model: 'gemini-3.8-flash' } }
  });
});

test('a pre-release apiKeys map is folded into endpoints', async () => {
  store.catchMeUpConfig = { baseUrl: OPENROUTER, model: 'openrouter/free', apiKeys: { [OPENROUTER]: 'or', [GEMINI]: 'gem' } };
  const config = await getConfig();
  assert.deepEqual(config.endpoints, {
    [OPENROUTER]: { apiKey: 'or', model: 'openrouter/free' },
    [GEMINI]: { apiKey: 'gem' }
  });
  await saveConfig({});
  assert.equal('apiKeys' in store.catchMeUpConfig, false);
});

test('legacy values never override what endpoints already holds', async () => {
  store.catchMeUpConfig = {
    baseUrl: OPENROUTER,
    apiKey: 'legacy',
    model: 'legacy-model',
    apiKeys: { [OPENROUTER]: 'pre' },
    endpoints: { [OPENROUTER]: { apiKey: 'current', model: 'current-model' } }
  };
  assert.deepEqual(pick(await getConfig()), { apiKey: 'current', model: 'current-model' });
});
