# Store listing answers (Chrome Web Store + AMO)

Copy-paste source for the review forms. Keep this in sync with `manifest.json` when
permissions change, because both stores ask you to justify every one of them.

## Single purpose

TD;DW generates a spoiler-free recap of the movie, show or video you are currently
watching, covering only the part you have already watched, up to the current playback
position.

## Permission justifications

**`storage`**
Saves your settings locally: which LLM provider you chose, your API key or local endpoint
URL, and display preferences. Nothing else is stored, and nothing is synced to us.

**`scripting`**
Registers the recap content scripts on a Jellyfin server at runtime. A self-hosted
Jellyfin origin is not known at build time, so it cannot be listed statically in the
manifest. Used only for the origin you configure in options.

**`contextMenus`**
Adds a right-click entry on supported watch pages to open the recap without reaching for
the toolbar icon or the keyboard shortcut.

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
- The user's API key is sent to that same endpoint to authenticate.

Not collected, not sold, not shared with anyone else. TD;DW runs no backend of its own; the
only third party in the path is the LLM provider the user chose. Data is not used for
creditworthiness, lending, or any purpose unrelated to producing the recap.

Certify all three: not sold to third parties, not used or transferred for purposes
unrelated to the single purpose, not used to determine creditworthiness.

## Privacy policy

Required by AMO whenever any data leaves the device, which it does here. Chrome also
expects a URL once you declare data transmission. Host it on GitHub Pages alongside the
repo and link it from both listings.

## Notes for reviewers (important)

TD;DW cannot be tested without an LLM endpoint. Give reviewers a working path or the
review will bounce:

- Supply a temporary API key for the default provider, or
- Point them at a local endpoint recipe, and name a specific public YouTube video with
  captions to test against.

Also tell them the keyboard shortcut (Alt+Shift+U) and that the overlay appears on a
supported watch page after playback has started.
