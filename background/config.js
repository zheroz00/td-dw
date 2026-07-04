// Single source of truth for extension config, stored under one key in
// chrome.storage.local. Imported by the service worker and the options page.

export const DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'openai/gpt-4o-mini',
  summaryLength: 'medium', // short | medium | detailed
  pauseOnOpen: true,
  recapProvider: 'auto', // auto = transcript when the adapter supplies one, else knowledge
  jellyfinUrl: '' // e.g. http://jellyfin.local:8096 — empty disables the Jellyfin adapter
};

const STORAGE_KEY = 'catchMeUpConfig';

export async function getConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(stored[STORAGE_KEY] || {}) };
}

export async function saveConfig(partial) {
  const next = { ...(await getConfig()), ...partial };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
