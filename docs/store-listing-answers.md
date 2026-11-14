# Store listing answers (Chrome Web Store + AMO)

Copy-paste source for the review forms. Keep this in sync with `manifest.json` when
permissions change, because both stores ask you to justify every one of them.

## Store listing copy

**Category:** Productivity (Tools). **Language:** English.

**Summary / short description** (132 characters max, same as the manifest):

Too Distracted, Didn't Watch: spoiler-free recaps of what you're watching, and quick summaries of articles you're reading.

**Detailed description:**

Looked at your phone and lost the plot? Press one button and TD;DW tells you what happened so
far, without spoiling anything that comes after where you are.

Video recaps
- Works on YouTube, Netflix, Prime Video, Disney+ and your own Jellyfin server.
- Recaps only up to your current playback position. Nothing past that point is mentioned.
- On YouTube and Jellyfin it reads the real captions, and on YouTube each point has a timestamp
  you can click to jump back to that moment.
- Ask follow-up questions ("who is the guy in the red coat?") and get spoiler-free answers.

Article summaries
- Click the icon on any article or blog post for a short summary that leads with the bottom line.
- Ask follow-up questions about the text.

Your model, your key
- Bring your own API key for OpenRouter or Google Gemini, or point it at any OpenAI-compatible
  endpoint, including a model running on your own machine.
- No accounts, no tracking, no analytics. Nothing is sent until you click, and then only to the
  provider you chose.

Open source (MIT): https://github.com/zheroz00/td-dw
Privacy policy: https://github.com/zheroz00/td-dw/blob/main/PRIVACY.md

**Screenshots:** `docs/images/store/cws-recap-1280x800.jpg`, `docs/images/store/cws-followup-1280x800.jpg`
(older panel design; replace with fresh shots, ideally one article summary, before going public).

**Icon:** `icons/icon128.png`.

## Single purpose

TD;DW catches you up on what's in your current tab: a spoiler-free recap of the video
you're watching (covering only the part you have already watched, up to the current
playback position), or a short summary of the article you're reading.

## Permission justifications

**`storage`**
Saves your settings locally: which LLM provider you chose, your API key or local endpoint
URL, and display preferences. Nothing else is stored, and nothing is synced to us.

**`scripting`**
Registers the recap content scripts on a Jellyfin server at runtime. A self-hosted
Jellyfin origin is not known at build time, so it cannot be listed statically in the
manifest. Used only for the origin you configure in options.

**`activeTab`**
Used only when you click the toolbar icon or press the shortcut on a page that isn't a
supported video site. It lets TD;DW read that one page's article text, at that moment, so
it can summarize it. No other pages are touched, and nothing is read in the background.

**`contextMenus`**
Adds a "TD;DW settings" item to the toolbar icon's right-click menu, so the settings page
is one click away (Firefox otherwise buries it under Manage Extension). No menu items are
added to web pages.

**`host_permissions: https://openrouter.ai/*`**
The default LLM provider. The extension sends the recap request here and reads the
response back. Granted on install because it is the out-of-the-box provider.

**`optional_host_permissions: https://*/*` and `http://*/*`**
NOT granted on install. Requested only if you point TD;DW at a custom LLM endpoint or your
own Jellyfin server, and only for that single origin, through the normal Chrome permission
prompt. Users who stay on the built-in sites with OpenRouter or Gemini are never asked.

**Content script matches (YouTube, Netflix, Prime Video, Disney+)**
Reads the video title and current playback position, and pulls captions or subtitles where
the site exposes them, so the recap can cover exactly what you have watched so far. It also
renders the recap overlay on the page.

## Remote code

**No.** The extension executes no remotely-hosted code. All JavaScript ships inside the
package. It makes network requests to an LLM endpoint and parses the JSON response as data.
There is no `eval`, no remote script loading, and nothing minified or obfuscated.

## Data usage disclosure

Declare that the extension **does** transmit user data, and tick **Website content**.

What is sent, and to whom:

- In transcript mode: the video's subtitles or captions plus its title go to the LLM
  endpoint the user configured (OpenRouter by default, or a local or custom endpoint).
- In hybrid mode (Netflix, Prime Video, Disney+ with subtitles switched on): the subtitle
  lines the player has shown on screen in that tab, plus the title.
- In knowledge mode: only the title and the user's questions.
- In article mode (the user clicked the icon on a non-video page): the page's article text,
  title, byline and site name (not the page URL), plus the user's questions.
- The user's API key is sent to that same endpoint to authenticate.

Not collected, not sold, not shared with anyone else. TD;DW runs no backend of its own; the
only third party in the path is the LLM provider the user chose. Data is not used for
creditworthiness, lending, or any purpose unrelated to producing the recap.

Certify all three: not sold to third parties, not used or transferred for purposes
unrelated to the single purpose, not used to determine creditworthiness.

## Privacy policy

Required by AMO whenever any data leaves the device, which it does here. Chrome also
expects a URL once you declare data transmission. It lives in the repo as `PRIVACY.md`;
link both listings to https://github.com/zheroz00/td-dw/blob/main/PRIVACY.md

The Firefox manifest declares `data_collection_permissions.required: ["websiteContent"]`,
since subtitles and article text are sent to the user's LLM provider.

## Notes for reviewers (important)

TD;DW cannot be tested without an LLM endpoint. Give reviewers a working path or the
review will bounce:

- Supply a temporary API key for the default provider, or
- Point them at a local endpoint recipe, and name a specific public YouTube video with
  captions to test against.

Also tell them the keyboard shortcut (Alt+Shift+U) and that the overlay appears on a
supported watch page after playback has started. For article mode, tell them to open any
news article or blog post and click the toolbar icon.
