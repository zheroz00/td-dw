# Firefox build

The Firefox version shares every line of code with the Chrome version. Only the manifest differs:
Firefox has no MV3 background service worker, so it uses an event page via `background.scripts`;
it wants `options_ui` rather than `options_page`; and it needs a `browser_specific_settings.gecko`
block carrying the add-on id.

Four `manifest.json` files, and only two of them are loadable:

- `manifest.json` at the repo root is the **Chrome source** manifest. Never point Firefox at it.
- `firefox/manifest.json` is the **Firefox source** manifest. Do not load it directly either; the
  shared code does not live next to it.
- `dist/chrome/` is the built Chrome variant. That is what Chrome, Edge and Brave load.
- `dist/firefox/` is the built Firefox variant, manifest sitting alongside the shared code. **That
  is the one Firefox loads.**

## Build

    scripts/build.sh

Assembles both variants from the shared source (`background/`, `content/`, `options/`, `icons/`,
`LICENSE`) plus the matching manifest, and zips each one. It also fails the build if the two
source manifests have drifted apart on any key that is not browser-specific, `version` very much
included. Add `--lint` to run `web-ext lint` over the Firefox build.

## Sign it, so it stays installed

    scripts/sign-firefox.sh

Release and Beta Firefox refuse unsigned add-ons outright, and flipping
`xpinstall.signatures.required` to false only works on Developer Edition, Nightly, ESR and
unbranded builds. So on ordinary Firefox, a temporary add-on loaded from `about:debugging` is all
you get until the package is signed by Mozilla, and a temporary add-on is dropped every time
Firefox exits, along with its `storage.local` (meaning you re-enter your API key each time).

`scripts/sign-firefox.sh` submits the build to AMO on the **unlisted** channel. Unlisted is
self-distribution: Mozilla runs automated review and signs the file, and nothing is ever published,
listed, searchable, or installable by anyone else from addons.mozilla.org. The signed `.xpi` comes
back in `dist/signed/`, and that file installs permanently in stock release Firefox on any machine
(`about:addons` → gear icon → **Install Add-on From File**).

The script builds, lints, and only then uploads, so a bad manifest fails locally in seconds rather
than after AMO has already consumed the version number. Two flags worth knowing:

- `--skip-build` re-signs the existing `dist/firefox/` without rebuilding. Use it to retry after an
  approval timeout: `web-ext sign` caches the upload in `dist/firefox/.amo-upload-uuid`, and a
  rebuild wipes that, forcing a full re-upload.
- `--strict` turns lint warnings into errors.

### Credentials

Generate an API key pair at <https://addons.mozilla.org/developers/addon/api/key/> (the AMO
account needs two-factor auth). The secret is shown exactly once. Store it outside the repo:

    ~/.config/td-dw/amo.env

    export WEB_EXT_API_KEY="user:12345678:123"
    export WEB_EXT_API_SECRET="the long secret, shown only once"

Both values are needed. `WEB_EXT_API_KEY` is the **JWT issuer** on that page (the `user:...:...`
one) and `WEB_EXT_API_SECRET` is the **JWT secret**. A bare value with no variable name does not
work, because the script sources this file as shell.

`chmod 600` it. The script sources that file when the variables are not already in the
environment, and falls back to `.env.amo` in the repo root, which `.gitignore` already covers via
`.env.*`. Prefer the `~/.config` path anyway: a file that is not in the working tree cannot be
committed by an over-eager `git add -f`.

To confirm the file is right before spending a version number on a failed submission:

    scripts/check-amo-creds.sh

It reports shape only (whether each variable is set, whether the key matches the issuer format,
how long the secret is) and never prints the values. Resist the urge to `cat` the file to check
it: the secret is a credential, and anything that echoes it puts it in your scrollback.

Credentials go through the environment, never as `--api-key` on the command line, so the secret
stays out of `ps` output and out of your shell history. Both `web-ext` calls also pass
`--no-config-discovery`, because `web-ext` otherwise picks up config files from your home
directory, and a stray one setting `channel: "listed"` would publish this add-on.

## Version numbers

AMO will not sign a version number it has already seen for this add-on id, so every signed build
needs a fresh one. Bump both manifests in a single step:

    scripts/bump-version.sh patch      # 0.1.0 -> 0.1.1
    scripts/bump-version.sh minor
    scripts/bump-version.sh 0.4.2      # or set one explicitly

It refuses to run if the two manifests already disagree, and it writes both files or neither. The
real backstop is the build's drift check: an out-of-sync `version` fails `scripts/build.sh`, which
`scripts/sign-firefox.sh` always runs first, so a mismatch cannot reach Mozilla.

## Tooling

Both scripts call `web-ext` through `npx` at a pinned version, so there is no `node_modules/` in
the repo. Pinning matters most for `sign`, which is handed your AMO secret and should not be
whatever npm published this morning. Set `WEB_EXT_BIN` to use a `web-ext` you already have
installed, for example when working offline.

## Requirements and notes

Requires Firefox 140+ (`world: "MAIN"` content scripts landed in 128, `data_collection_permissions`
in 140). On Android the floor is 142, which is why
`browser_specific_settings.gecko_android.strict_min_version` is pinned there. Without it,
`web-ext lint` warns that an Android 140 build predates `data_collection_permissions` support.

Note on `data_collection_permissions`: it is declared as `none` because TD;DW itself collects
nothing; everything goes only to the LLM endpoint you configure. That is uncontroversial on the
unlisted channel, which is automated review. Revisit it before any **listed** AMO submission, where
a human reviewer may read "sends subtitles to a user-chosen third party" more strictly.

## Auto-updates (not wired up yet)

A signed unlisted `.xpi` installs permanently but does not update itself; you copy a new one over
the old one. Self-hosted updates are the supported fix and are fully compatible with unlisted
signing: add `browser_specific_settings.gecko.update_url` pointing at an `updates.json` served over
HTTPS, keyed by the add-on id.

The catch: `update_url` is a hard error for **listed** AMO submissions (`addons-linter` reports
`MANIFEST_UPDATE_URL`, `"update_url" is not allowed.`). AMO's validator only tolerates it because
unlisted uploads are treated as self-hosted. So one manifest cannot serve both channels, and adding
`update_url` is a one-way door away from ever listing this add-on publicly without stripping it out
again first. `scripts/sign-firefox.sh` already passes `--self-hosted` to the linter, so the day
this lands, no script needs editing.

Two more things to get right when it happens: GitHub Pages serves `.xpi` as
`application/octet-stream`, so host the binary as a GitHub Release asset and keep only
`updates.json` on Pages. And `updates.json` becomes a third home for the version number, which is
exactly the desync problem the bump script just solved, so generate it at sign time rather than by
hand.
