// Single source of truth for extension config, stored under one key in
// chrome.storage.local. Imported by the service worker and the options page.

export const DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  // Keys are stored per endpoint (see endpointKey) so switching providers keeps
  // each one. getConfig() derives `apiKey` for the active baseUrl from this map.
  apiKeys: {},
  // Verified live against OpenRouter's /models and Google's model docs on
  // 2026-09-05: current stable Flash, 1M context. Existing users keep whatever
  // model they already have stored — getConfig() merges stored over defaults.
  model: 'google/gemini-3.8-flash',
  summaryLength: 'medium', // short | medium | detailed
  pauseOnOpen: true,
  recapProvider: 'auto', // auto = transcript when the adapter supplies one, else knowledge
  jellyfinUrl: '', // e.g. http://jellyfin.local:8096 — empty disables the Jellyfin adapter
  spoilerFreeAnswers: true, // follow-up Q&A only; true = keep answers behind the timestamp. The recap is always spoiler-free.
  // 'standard' (~400k chars, ~100k tokens: any 3-hour title on a cloud model) | 'local' (~60k chars for small-context local models)
  transcriptBudget: 'standard'
};

// Content scripts can't import ES modules, so content/adapters/transcript-cap.js
// keeps its own copy of this map as globalThis.TDDW.TRANSCRIPT_BUDGET_CHARS.
// Keep the two in sync.
export const TRANSCRIPT_BUDGET_CHARS = { standard: 400000, local: 60000 };

const STORAGE_KEY = 'catchMeUpConfig';

// The map key for an endpoint's API key: the baseUrl without surrounding
// whitespace or trailing slashes, so "…/v1" and "…/v1/" share a key. Custom
// endpoints (Mistral, a local server) get their own slot just like presets.
export function endpointKey(url = '') {
  return url.trim().replace(/\/+$/, '');
}

export async function getConfig() {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  // v0.2.1 and earlier stored a single top-level apiKey. Adopt it for the
  // endpoint it was saved alongside; the next save drops the old field.
  const { apiKey: legacyKey, ...rest } = stored;
  const config = { ...DEFAULTS, ...rest };
  const apiKeys = { ...config.apiKeys };
  const active = endpointKey(config.baseUrl);
  if (legacyKey && !(active in apiKeys)) apiKeys[active] = legacyKey;
  return { ...config, apiKeys, apiKey: apiKeys[active] || '' };
}

// `partial.apiKey`, when present, is the key for the endpoint being saved
// (partial.baseUrl, or the stored one). `partial.apiKeys` replaces the whole
// map. Empty keys are dropped rather than stored.
export async function saveConfig(partial) {
  const { apiKey, ...rest } = partial;
  const { apiKey: _derived, ...next } = { ...(await getConfig()), ...rest };
  const apiKeys = { ...next.apiKeys };
  if (apiKey !== undefined) apiKeys[endpointKey(next.baseUrl)] = apiKey;
  for (const [endpoint, key] of Object.entries(apiKeys)) {
    if (!endpoint || !key) delete apiKeys[endpoint];
  }
  const toStore = { ...next, apiKeys };
  await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
  return { ...toStore, apiKey: apiKeys[endpointKey(toStore.baseUrl)] || '' };
}

// Infers which provider preset a baseUrl matches, for the options UI dropdown
// and for llm-client.js's reasoning-effort field selection. baseUrl remains
// the single source of truth; this is only ever derived from it.
export function providerFromUrl(url = '') {
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'custom';
}
