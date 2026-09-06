// Single source of truth for extension config, stored under one key in
// chrome.storage.local. Imported by the service worker and the options page.

export const DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'openai/gpt-4o-mini',
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

export async function getConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(stored[STORAGE_KEY] || {}) };
}

export async function saveConfig(partial) {
  const next = { ...(await getConfig()), ...partial };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
