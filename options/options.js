// Options page is an extension page, so it can use ES modules and share
// config.js with the service worker.
import { getConfig, saveConfig } from '../background/config.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

// Provider presets fill in the OpenAI-compatible endpoint (and a sensible
// default model) so users don't have to memorize base URLs. baseUrl remains the
// single source of truth — the dropdown is inferred from it on load.
const PRESETS = {
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' }
};

function providerFromUrl(url = '') {
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'custom';
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
    pauseOnOpen: $('pauseOnOpen').checked,
    jellyfinUrl: $('jellyfinUrl').value.trim().replace(/\/+$/, '')
  };
}

async function load() {
  const config = await getConfig();
  $('baseUrl').value = config.baseUrl;
  $('apiKey').value = config.apiKey;
  $('model').value = config.model;
  $('summaryLength').value = config.summaryLength;
  $('pauseOnOpen').checked = config.pauseOnOpen;
  $('jellyfinUrl').value = config.jellyfinUrl;
  $('provider').value = providerFromUrl(config.baseUrl);
}

// Switching provider fills the endpoint + a matching default model; "custom"
// leaves the fields alone for manual entry.
$('provider').addEventListener('change', () => {
  const preset = PRESETS[$('provider').value];
  if (!preset) return;
  $('baseUrl').value = preset.url;
  $('model').value = preset.model;
});

// Non-OpenRouter endpoints need a host permission granted at save time.
// Match patterns can't carry a port, so a pattern like "http://myserver/*"
// covers myserver on any port.
async function ensureHostPermission(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('That base URL doesn’t parse as a URL.');
  }
  if (url.hostname === 'openrouter.ai') return; // granted at install
  const pattern = `${url.protocol}//${url.hostname}/*`;
  if (await chrome.permissions.contains({ origins: [pattern] })) return;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    throw new Error(`Permission for ${pattern} was declined — the extension can’t reach that endpoint without it.`);
  }
}

$('save').addEventListener('click', async () => {
  const values = readForm();
  try {
    await ensureHostPermission(values.baseUrl);
    // Jellyfin runs on the user's own server origin — needs its own host grant
    // so the adapter can be injected there. Only when a URL is set.
    if (values.jellyfinUrl) await ensureHostPermission(values.jellyfinUrl);
    await saveConfig(values);
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
    await ensureHostPermission(values.baseUrl);
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
