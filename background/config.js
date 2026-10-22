// Single source of truth for extension config, stored under one key in
// chrome.storage.local. Imported by the service worker and the options page.

export const DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  // Per-endpoint settings, { [endpointKey]: { apiKey, model } }, so switching
  // providers keeps each one's key and model. getConfig() derives the active
  // `apiKey` and `model` from the entry for the current baseUrl.
  endpoints: {},
  // Model for an endpoint with none saved yet. Verified live against
  // OpenRouter's /models and Google's model docs on 2026-09-05: current stable
  // Flash, 1M context.
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

// The map key for an endpoint's settings: the baseUrl without surrounding
// whitespace or trailing slashes, so "…/v1" and "…/v1/" share an entry. Custom
// endpoints (Mistral, a local server) get their own entry just like presets.
export function endpointKey(url = '') {
  return url.trim().replace(/\/+$/, '');
}

// The flat config every caller reads: the stored settings plus `apiKey` and
// `model` for the active endpoint.
function withActiveEndpoint(config) {
  const entry = config.endpoints[endpointKey(config.baseUrl)] || {};
  return { ...config, apiKey: entry.apiKey || '', model: entry.model || DEFAULTS.model };
}

export async function getConfig() {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  // Older formats: v0.2.1 and earlier kept one top-level apiKey and model;
  // pre-release builds kept an apiKeys map of keys only. Fold both into
  // `endpoints` without overriding anything already there. The next save
  // drops the old fields.
  const { apiKey: legacyKey, model: legacyModel, apiKeys: legacyKeys, ...rest } = stored;
  const config = { ...DEFAULTS, ...rest };
  const endpoints = {};
  for (const [endpoint, apiKey] of Object.entries(legacyKeys || {})) endpoints[endpoint] = { apiKey };
  for (const [endpoint, entry] of Object.entries(config.endpoints)) {
    endpoints[endpoint] = { ...endpoints[endpoint], ...entry };
  }
  const active = endpointKey(config.baseUrl);
  const entry = { ...endpoints[active] };
  if (legacyKey && entry.apiKey === undefined) entry.apiKey = legacyKey;
  if (legacyModel && entry.model === undefined) entry.model = legacyModel;
  if (Object.keys(entry).length) endpoints[active] = entry;
  return withActiveEndpoint({ ...config, endpoints });
}

// `partial.apiKey` / `partial.model`, when present, belong to the endpoint
// being saved (partial.baseUrl, or the stored one). `partial.endpoints`
// replaces the whole map. Empty values and entries are dropped, not stored.
export async function saveConfig(partial) {
  const { apiKey, model, endpoints: replacement, ...rest } = partial;
  const current = await getConfig();
  const { apiKey: _key, model: _model, ...next } = { ...current, ...rest };
  const active = endpointKey(next.baseUrl);
  const endpoints = {};
  for (const [endpoint, entry] of Object.entries(replacement || current.endpoints)) {
    endpoints[endpoint] = { ...entry };
  }
  if (apiKey !== undefined || model !== undefined) {
    endpoints[active] = { ...endpoints[active] };
    if (apiKey !== undefined) endpoints[active].apiKey = apiKey;
    if (model !== undefined) endpoints[active].model = model;
  }
  for (const [endpoint, entry] of Object.entries(endpoints)) {
    for (const field of Object.keys(entry)) if (!entry[field]) delete entry[field];
    if (!endpoint || !Object.keys(entry).length) delete endpoints[endpoint];
  }
  const toStore = { ...next, endpoints };
  await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
  return withActiveEndpoint(toStore);
}

// Infers which provider preset a baseUrl matches, for the options UI dropdown
// and for llm-client.js's reasoning-effort field selection. baseUrl remains
// the single source of truth; this is only ever derived from it.
export function providerFromUrl(url = '') {
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'custom';
}

// Human name for an endpoint, for the overlay's model line: the preset's name,
// or the host (with port) of a custom endpoint, e.g. "api.mistral.ai".
export function endpointLabel(url = '') {
  const provider = providerFromUrl(url);
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'gemini') return 'Gemini';
  try {
    return new URL(url).host || 'Custom endpoint';
  } catch {
    return 'Custom endpoint';
  }
}
