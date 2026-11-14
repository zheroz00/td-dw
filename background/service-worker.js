import { getConfig, endpointLabel } from './config.js';
import { pickProvider } from './providers/index.js';
import { buildQuestionMessages } from './providers/prompts.js';
import { buildArticleMessages, buildArticleQuestionMessages } from './providers/article-prompts.js';
import { chatCompletion, chatCompletionDetailed } from './llm-client.js';

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
  'content/adapters/transcript-cap.js',
  'content/adapters/youtube-transcript.js',
  'content/adapters/youtube.js',
  'content/adapters/dom-video-adapter.js',
  'content/adapters/caption-capture.js',
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

// --- Article mode: on-demand injection -------------------------------------
// Pages without a static content script get this bundle injected when the user
// clicks the icon or presses the shortcut (activeTab grants that one tab, so no
// broad host permission is needed). Order matters: Readability and the text
// helpers first, the orchestrator last. The overlay files are shared with the
// video bundle.
const ARTICLE_JS = [
  'content/vendor/readability/Readability.js',
  'content/article/article-text.js',
  'content/ui/overlay-styles.js',
  'content/ui/overlay.js',
  'content/article/article-content.js'
];

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

// Right-click on the toolbar icon -> "TD;DW settings". Chrome adds its own
// "Options" entry there, but Firefox only offers "Manage Extension", which
// buries the settings a click deeper. (Re)created on install; menus persist.
const SETTINGS_MENU_ID = 'tddw-open-settings';

function createSettingsMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SETTINGS_MENU_ID,
      title: 'TD;DW settings',
      contexts: ['action']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === SETTINGS_MENU_ID) chrome.runtime.openOptionsPage();
});

// Fire-and-forget lifecycle hooks: log failures, they have no caller to report to.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TD;DW] installed');
  createSettingsMenu();
  syncJellyfinScripts().catch((err) => console.warn('[TD;DW] Jellyfin script sync failed:', err.message));
});

chrome.runtime.onStartup.addListener(() => {
  syncJellyfinScripts().catch((err) => console.warn('[TD;DW] Jellyfin script sync failed:', err.message));
});

// Flash a badge so a click on a page we can't read isn't silent.
async function flashBadge(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c0392b' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }, 3000);
  } catch { /* tab may be gone */ }
}

// Only http(s) pages can hold an article. An undefined url (some browsers hide
// it) is let through: the injection itself rejects pages we can't touch.
function isInjectable(tab) {
  return tab.url === undefined || /^https?:/i.test(tab.url);
}

// Match pattern ("*://*.primevideo.com/*") -> RegExp. Only the shapes our own
// manifest and originPattern() produce need handling.
function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

// A video site whose content script didn't answer means the tab predates an
// extension reload. Summarizing the watch page as an "article" would be
// nonsense there, so keep the old badge (the fix is refreshing the tab).
async function isVideoSite(url) {
  if (!url) return false;
  const patterns = chrome.runtime.getManifest().content_scripts.flatMap((cs) => cs.matches);
  const { jellyfinUrl } = await getConfig();
  if (jellyfinUrl) {
    try { patterns.push(originPattern(jellyfinUrl)); } catch { /* invalid URL: no Jellyfin site */ }
  }
  return patterns.some((p) => patternToRegExp(p).test(url));
}

// True once article-content.js has run in this tab. Guards a fast double click
// from injecting the bundle twice (a second overlay.js would replace the
// overlay the first run attached its handlers to).
async function articleModeLoaded(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!globalThis.TDDW?.articleModeLoaded
  });
  return !!res?.result;
}

async function toggleOverlay(tab) {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
    return;
  } catch (err) {
    // No content script in this tab: not a supported video site, or the tab was
    // opened before the extension was (re)loaded. Try article mode instead.
    console.warn('[TD;DW] no content script in tab', tab.id, err.message);
  }

  if (!isInjectable(tab) || (await isVideoSite(tab.url))) {
    await flashBadge(tab.id);
    return;
  }
  try {
    if (!(await articleModeLoaded(tab.id))) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ARTICLE_JS });
    }
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
  } catch (err) {
    // Browser-internal pages, extension stores and PDF viewers refuse injection.
    console.warn('[TD;DW] article mode unavailable in tab', tab.id, err.message);
    await flashBadge(tab.id);
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
      const { servedModel, ...result } = await provider.getRecap(msg.videoState, config);
      // Which endpoint and model produced this, so the overlay can show it.
      // Errors carry it too: "which model failed" is half the diagnosis.
      result.llm = { endpoint: endpointLabel(config.baseUrl), model: config.model, servedModel };
      sendResponse(result);
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'ASK_QUESTION') {
    // Follow-up Q&A about the current title. No caller endpoint override (unlike
    // TEST_LLM), so the extension-id guard above is sufficient.
    (async () => {
      const config = await getConfig();
      const messages = buildQuestionMessages(
        msg.videoState,
        config,
        msg.recapText,
        msg.history || [],
        msg.question
      );
      const answer = await chatCompletion(config, messages, { effort: 'medium' });
      sendResponse({ ok: true, answer });
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'GET_ARTICLE_SUMMARY') {
    (async () => {
      const text = msg.article?.text;
      if (typeof text !== 'string' || !text.trim()) {
        sendResponse({ ok: false, error: 'No article text to summarize.' });
        return;
      }
      const config = await getConfig();
      const llm = { endpoint: endpointLabel(config.baseUrl), model: config.model };
      if (!config.apiKey && (config.baseUrl || '').includes('openrouter.ai')) {
        sendResponse({ ok: false, error: 'No API key configured. Open settings to add your OpenRouter key.', llm });
        return;
      }
      try {
        const { text: summaryText, model: servedModel } = await chatCompletionDetailed(
          config, buildArticleMessages(msg.article, config), { temperature: 0, effort: 'low' }
        );
        const served = { ...llm, servedModel };
        if (!summaryText?.trim()) {
          sendResponse({ ok: false, error: 'The model returned an empty summary. Try again, or pick a different model in settings.', llm: served });
          return;
        }
        sendResponse({ ok: true, summaryText, llm: served });
      } catch (err) {
        sendResponse({ ok: false, error: err.message, llm });
      }
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'ASK_ARTICLE_QUESTION') {
    (async () => {
      const config = await getConfig();
      const messages = buildArticleQuestionMessages(
        msg.article,
        config,
        msg.summaryText,
        msg.history || [],
        msg.question
      );
      const answer = await chatCompletion(config, messages, { effort: 'medium' });
      sendResponse({ ok: true, answer });
    })().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async sendResponse
  }

  if (msg?.type === 'TEST_LLM') {
    // This merges a caller-supplied endpoint override and then sends the stored
    // API key to it — so only accept it from one of the extension's own pages
    // (the options UI), never from a content script running inside a web page.
    // Note: sender.tab is NOT a usable discriminator — the options page runs in
    // a tab too, so it's set for both. Match the sender URL's extension origin.
    const fromOwnPage = sender.url?.startsWith(chrome.runtime.getURL(''));
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
        temperature: 0,
        effort: 'low'
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
