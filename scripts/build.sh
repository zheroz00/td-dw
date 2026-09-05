#!/usr/bin/env bash
# Assemble both browser variants from the one shared source tree.
#
#   dist/chrome/   shared source + manifest.json          -> dist/td-dw-chrome.zip
#   dist/firefox/  shared source + firefox/manifest.json  -> dist/td-dw-firefox.zip
#
# Load dist/chrome/ in Chrome, Edge or Brave. dist/firefox/ is what Firefox loads
# temporarily, and what scripts/sign-firefox.sh submits to AMO for signing.
# Never point a browser at the repo root or at the other browser's folder: both
# browsers will load the wrong manifest without refusing, then misbehave.
#
# Optional: pass --lint to run `web-ext lint` on the Firefox build (npx needs network).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

# Pinned on purpose. sign-firefox.sh hands this tool an AMO API secret, so it
# should not be whatever npm published this morning. Bump deliberately.
WEB_EXT_VERSION="10.6.0"
WEB_EXT=(npx --yes "web-ext@${WEB_EXT_VERSION}")
[[ -n "${WEB_EXT_BIN:-}" ]] && WEB_EXT=("$WEB_EXT_BIN")

# Everything the extension ships. The manifest is added per variant below.
SHARED=(background content options icons LICENSE)

# Guard against the two manifests drifting apart on anything but browser keys.
# This runs before anything is written, so a drifted pair fails the whole build
# rather than producing one good variant and one stale one. sign-firefox.sh calls
# this script first, which puts this check on the critical path to AMO.
node -e '
  const fs = require("fs");
  const a = JSON.parse(fs.readFileSync(process.argv[1]));
  const b = JSON.parse(fs.readFileSync(process.argv[2]));
  const ignore = new Set(["background", "browser_specific_settings", "options_page", "options_ui"]);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !ignore.has(k)));
  const drift = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (drift.length) { console.error("manifest drift between chrome and firefox on:", drift.join(", ")); process.exit(1); }
' "$ROOT/manifest.json" "$ROOT/firefox/manifest.json"

build_variant() {
  local name="$1" manifest="$2"
  local out="$DIST/$name" zip="$DIST/td-dw-$name.zip"

  rm -rf "$out"
  mkdir -p "$out"
  for item in "${SHARED[@]}"; do
    cp -R "$ROOT/$item" "$out/"
  done
  cp "$manifest" "$out/manifest.json"

  # `zip -qr .` sweeps up dotfiles too, which is only safe because the rm -rf
  # above guarantees a clean tree. web-ext sign leaves .amo-upload-uuid in
  # dist/firefox/, and that must never end up inside a package.
  rm -f "$zip"
  (cd "$out" && zip -qr "$zip" .)

  printf '  %-14s -> %s\n' "$name" "$zip"
}

build_variant chrome "$ROOT/manifest.json"
build_variant firefox "$ROOT/firefox/manifest.json"

if [[ "${1:-}" == "--lint" ]]; then
  echo
  # --self-hosted matches the unlisted signing channel and pre-authorises a future
  # gecko.update_url. --no-config-discovery keeps stray ~/.web-ext-config.* files out.
  "${WEB_EXT[@]}" lint \
    --source-dir "$DIST/firefox" \
    --self-hosted \
    --no-config-discovery
fi

cat <<EOF

Load these, and only these:
  Chrome / Edge / Brave   $DIST/chrome
  Firefox (temporary)     $DIST/firefox/manifest.json

For a Firefox install that survives a restart, run scripts/sign-firefox.sh instead.
EOF
