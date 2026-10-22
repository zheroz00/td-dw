// Options page is an extension page, so it can use ES modules and share
// config.js with the service worker.
import { getConfig, saveConfig, providerFromUrl, endpointKey } from '../background/config.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

// Provider presets fill in the OpenAI-compatible endpoint (and a sensible
// default model) so users don't have to memorize base URLs. baseUrl remains the
// single source of truth — the dropdown is inferred from it on load.
// Verified live on 2026-09-05 (OpenRouter /models and Google's model docs):
// current stable Flash, 1M context.
const PRESETS = {
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'google/gemini-3.8-flash' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash' }
};

// Key and model per endpoint, seeded from storage and updated as the user
// switches endpoints, so values typed but not yet saved survive switching away
// and back. Save writes the whole map. shownEndpoint is whose values the key
// and model fields hold now.
let endpoints = {};
let shownEndpoint = '';

// Stashes the shown endpoint's key and model, then fills in the ones saved for
// the endpoint now in the URL field. An endpoint with no saved model gets
// `fallbackModel` (a preset's default), or keeps the field as it is.
function swapToEndpoint(fallbackModel) {
  const next = endpointKey($('baseUrl').value);
  if (next === shownEndpoint) return;
  endpoints[shownEndpoint] = { apiKey: $('apiKey').value.trim(), model: $('model').value.trim() };
  const saved = endpoints[next] || {};
  $('apiKey').value = saved.apiKey || '';
  $('model').value = saved.model || fallbackModel || $('model').value;
  shownEndpoint = next;
}

function setStatus(text, kind = '') {
  status.textContent = text;
  status.className = `hint ${kind}`;
}

function readForm() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    summaryLength: $('summaryLength').value,
    recapProvider: $('recapProvider').value,
    transcriptBudget: $('transcriptBudget').value,
    pauseOnOpen: $('pauseOnOpen').checked,
    spoilerFreeAnswers: $('spoilerFreeAnswers').checked,
    jellyfinUrl: $('jellyfinUrl').value.trim().replace(/\/+$/, '')
  };
}

async function load() {
  const config = await getConfig();
  $('baseUrl').value = config.baseUrl;
  $('apiKey').value = config.apiKey;
  endpoints = structuredClone(config.endpoints);
  shownEndpoint = endpointKey(config.baseUrl);
  $('model').value = config.model;
  $('summaryLength').value = config.summaryLength;
  $('recapProvider').value = config.recapProvider;
  $('transcriptBudget').value = config.transcriptBudget;
  $('pauseOnOpen').checked = config.pauseOnOpen;
  $('spoilerFreeAnswers').checked = config.spoilerFreeAnswers;
  $('jellyfinUrl').value = config.jellyfinUrl;
  $('provider').value = providerFromUrl(config.baseUrl);
}

// Switching provider fills the endpoint and swaps in its saved key and model,
// or the preset's default model the first time; "custom" leaves the fields
// alone for manual entry.
$('provider').addEventListener('change', () => {
  const preset = PRESETS[$('provider').value];
  if (!preset) return;
  $('baseUrl').value = preset.url;
  swapToEndpoint(preset.model);
});

// Editing the URL by hand (a custom endpoint) swaps the same way.
$('baseUrl').addEventListener('change', () => swapToEndpoint());

// Non-OpenRouter endpoints (and the Jellyfin server) need a host permission.
// Match patterns can't carry a port, so a pattern like "http://myserver/*"
// covers myserver on any port.
function originPattern(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`"${rawUrl}" doesn’t parse as a URL.`);
  }
  if (url.hostname === 'openrouter.ai') return null; // granted at install
  return `${url.protocol}//${url.hostname}/*`;
}

// Must be the FIRST awaited call in a click handler: Firefox only allows
// permissions.request() synchronously inside a user-input handler, so any
// earlier await (even permissions.contains) ends the gesture and it throws.
// Chrome is lenient, which is why this used to work there. request() resolves
// true without prompting when the permission is already held, so no pre-check.
async function ensureHostPermissions(...urls) {
  const origins = urls.filter(Boolean).map(originPattern).filter(Boolean);
  if (!origins.length) return;
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    throw new Error(`Permission for ${origins.join(', ')} was declined — the extension can’t reach that endpoint without it.`);
  }
}

$('save').addEventListener('click', async () => {
  const values = readForm();
  try {
    // One request covering the endpoint and (if set) the Jellyfin origin, so
    // the adapter can be injected on the user's own server.
    await ensureHostPermissions(values.baseUrl, values.jellyfinUrl);
    endpoints[shownEndpoint] = { apiKey: values.apiKey, model: values.model };
    await saveConfig({ ...values, endpoints });
    // (Re)register or tear down the Jellyfin content scripts to match the URL.
    const sync = await chrome.runtime.sendMessage({ type: 'SYNC_JELLYFIN_SCRIPTS' });
    if (sync && !sync.ok) throw new Error(sync.error || 'Could not register the Jellyfin adapter.');
    setStatus('Saved.', 'ok');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('test').addEventListener('click', async () => {
  const values = readForm();
  setStatus('Testing…');
  try {
    await ensureHostPermissions(values.baseUrl);
    const result = await chrome.runtime.sendMessage({ type: 'TEST_LLM', configOverride: values });
    if (result?.ok) {
      setStatus('Connection works — model responded.', 'ok');
    } else {
      setStatus(result?.error || 'Unknown error.', 'error');
    }
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

load();
