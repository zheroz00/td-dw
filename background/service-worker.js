import { getConfig } from './config.js';
import { pickProvider } from './providers/index.js';
import { chatCompletion } from './llm-client.js';

// --- Jellyfin: dynamic content-script registration -------------------------
// The Jellyfin server origin isn't known at build time, so it can't live in the
// static content_scripts manifest block. Instead we register the same ordered
// bundle at runtime for whatever origin the user configures, keyed off
// jellyfinUrl. Running on the Jellyfin origin lets the adapter call the REST API
// same-origin (no CORS) and read the logged-in token off the page.
const JELLYFIN_ISOLATED_ID = 'jellyfin-isolated';
const JELLYFIN_MAIN_ID = 'jellyfin-main';

// Mirror of manifest content_scripts[0].js, with the two Jellyfin files slotted
// in before index.js (which queries the populated adapter registry).
const JELLYFIN_ISOLATED_JS = [
  'content/adapters/youtube-transcript.js',
  'content/adapters/youtube.js',
  'content/adapters/dom-video-adapter.js',
  'content/adapters/netflix.js',
  'content/adapters/primevideo.js',
  'content/adapters/disneyplus.js',
  'content/adapters/jellyfin-subtitles.js',
  'content/adapters/jellyfin.js',
  'content/adapters/index.js',
  'content/ui/overlay-styles.js',
  'content/ui/overlay.js',
  'content/content.js'
];
const JELLYFIN_MAIN_JS = ['content/main-world/media-session-probe.js'];

// Match patterns can't carry a port, so "http://host/*" covers any port (8096).
function originPattern(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

async function unregisterJellyfin() {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const ids = existing
    .map((s) => s.id)
    .filter((id) => id === JELLYFIN_ISOLATED_ID || id === JELLYFIN_MAIN_ID);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
}

// Idempotent: unregister then (re)register for the current config. Safe to call
// on install, startup, and whenever the options page saves. Intentional no-ops
// (no URL, invalid URL, permission not yet granted) return quietly; a genuine
// registration failure REJECTS so the caller (options save) can surface it
// instead of the user seeing "Saved" while the adapter never loaded.
async function syncJellyfinScripts() {
  await unregisterJellyfin();
  const { jellyfinUrl } = await getConfig();
  if (!jellyfinUrl) return;

  let pattern;
  try {
    pattern = originPattern(jellyfinUrl);
  } catch {
    console.warn('[TD;DW] invalid jellyfinUrl, not registering:', jellyfinUrl);
    return;
  }
  // The host permission is requested from the options page (a user gesture);
  // if it isn't granted yet, registration would throw — skip quietly.
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) {
    console.warn('[TD;DW] host permission for', pattern, 'not granted; Jellyfin adapter inactive');
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: JELLYFIN_ISOLATED_ID,
      matches: [pattern],
      js: JELLYFIN_ISOLATED_JS,
      runAt: 'document_idle'
    },
    {
      id: JELLYFIN_MAIN_ID,
      matches: [pattern],
      js: JELLYFIN_MAIN_JS,
      runAt: 'document_idle',
      world: 'MAIN'
    }
  ]);
  console.log('[TD;DW] Jellyfin adapter registered for', pattern);
}

// Fire-and-forget lifecycle hooks: log failures, they have no caller to report to.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TD;DW] installed');
  syncJellyfinScripts().catch((err) => console.warn('[TD;DW] Jellyfin script sync failed:', err.message));
});

chrome.runtime.onStartup.addListener(() => {
  syncJellyfinScripts().catch((err) => console.warn('[TD;DW] Jellyfin script sync failed:', err.message));
});

async function toggleOverlay(tab) {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
  } catch (err) {
    // No content script in this tab: unsupported page, or the tab was opened
    // before the extension was (re)loaded. Flash a badge so the click isn't silent.
    console.warn('[TD;DW] no content script in tab', tab.id, err.message);
    try {
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#c0392b' });
      await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
      setTimeout(() => {
        chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {});
      }, 3000);
    } catch { /* tab may be gone */ }
  }
}

chrome.action.onClicked.addListener(toggleOverlay);

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-recap') toggleOverlay(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Defense-in-depth: only handle messages from our own extension. There's no
  // externally_connectable entry, so web pages can't reach this today — but this
  // keeps the handlers (which wield the stored API key) safe if that changes.
  if (sender.id !== chrome.runtime.id) return;

  if (msg?.type === 'GET_RECAP') {
    (async () => {
      const config = await getConfig();
      const provider = pickProvider(msg.videoState, config);
      sendResponse(await provider.getRecap(msg.videoState, config));
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'TEST_LLM') {
    // This merges a caller-supplied endpoint override and then sends the stored
    // API key to it — so only accept it from one of the extension's own pages
    // (the options UI), never from a content script running inside a web page.
    // Note: sender.tab is NOT a usable discriminator — the options page runs in
    // a tab too, so it's set for both. Match the sender URL's extension origin.
    const fromOwnPage = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    if (!fromOwnPage) {
      sendResponse({ ok: false, error: 'TEST_LLM is only allowed from the extension options page.' });
      return true;
    }
    (async () => {
      const config = { ...(await getConfig()), ...(msg.configOverride || {}) };
      // Generous budget: reasoning models burn hidden thinking tokens before
      // producing even a two-letter reply; 5 tokens made the test lie.
      await chatCompletion(config, [{ role: 'user', content: 'Reply with OK.' }], {
        maxTokens: 500,
        temperature: 0
      });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg?.type === 'SYNC_JELLYFIN_SCRIPTS') {
    syncJellyfinScripts()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
});
