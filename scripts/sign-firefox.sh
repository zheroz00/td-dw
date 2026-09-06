#!/usr/bin/env bash
# Sign the Firefox build with Mozilla via AMO's "unlisted" (self-distribution)
# channel, producing an .xpi that installs permanently in release Firefox.
#
# Nothing is published or listed. Unlisted means Mozilla runs automated review,
# signs the file and hands it back; it is never searchable on addons.mozilla.org
# and nobody else can install it from there.
#
# Credentials (never in git). Create a key pair at
#   https://addons.mozilla.org/developers/addon/api/key/   (the account needs 2FA)
# then put them in ~/.config/td-dw/amo.env :
#   export WEB_EXT_API_KEY="user:12345678:123"
#   export WEB_EXT_API_SECRET="the long secret, shown only once"
#
# Usage:
#   scripts/sign-firefox.sh               build, lint, sign
#   scripts/sign-firefox.sh --skip-build  re-sign the existing dist/firefox
#                                         (retry after an approval timeout; keeps
#                                          .amo-upload-uuid so the zip is not re-uploaded)
#   scripts/sign-firefox.sh --strict      treat lint warnings as errors too
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/dist/firefox"
ARTIFACTS="$ROOT/dist/signed"

# Pinned on purpose: this command is handed your AMO API secret, so it should not
# be whatever npm published this morning. Keep in step with scripts/build.sh.
WEB_EXT_VERSION="10.6.0"
WEB_EXT=(npx --yes "web-ext@${WEB_EXT_VERSION}")
[[ -n "${WEB_EXT_BIN:-}" ]] && WEB_EXT=("$WEB_EXT_BIN")

SKIP_BUILD=0
LINT_STRICT=()
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --strict)     LINT_STRICT=(--warnings-as-errors) ;;
    -h|--help)    sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- credentials -------------------------------------------------------------
CRED_FILE="${TDDW_AMO_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/td-dw/amo.env}"
if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  for candidate in "$CRED_FILE" "$ROOT/.env.amo"; do
    if [[ -f "$candidate" ]]; then
      perms="$(stat -c '%a' "$candidate" 2>/dev/null || echo '')"
      [[ -n "$perms" && "${perms: -2}" != "00" ]] && \
        echo "warning: $candidate is group/world readable (chmod 600 it)" >&2
      # shellcheck disable=SC1090
      . "$candidate"
      break
    fi
  done
fi
if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  cat >&2 <<EOF
No AMO credentials found.

Create a key pair at https://addons.mozilla.org/developers/addon/api/key/
(the AMO account needs two-factor auth enabled), then:

  mkdir -p "$(dirname "$CRED_FILE")"
  cat > "$CRED_FILE" <<'KEYS'
export WEB_EXT_API_KEY="user:12345678:123"
export WEB_EXT_API_SECRET="the long secret, shown only once"
KEYS
  chmod 600 "$CRED_FILE"

web-ext reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from the environment, so the
secret never appears in argv (no leak via ps) and never in your shell history.
EOF
  exit 1
fi

# --- duplicate version guard (cheap and local; AMO is the real authority) -----
VERSION="$(node -e 'const fs=require("fs");
  process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version)' \
  "$ROOT/firefox/manifest.json")"

if compgen -G "$ARTIFACTS/*-${VERSION}.xpi" > /dev/null 2>&1; then
  echo "dist/signed already holds a signed ${VERSION}.xpi." >&2
  echo "AMO will not sign a version number twice for this add-on id." >&2
  echo "Bump first:  scripts/bump-version.sh patch" >&2
  exit 1
fi

# --- build (this is what runs the chrome/firefox manifest drift check) --------
if [[ "$SKIP_BUILD" -eq 1 ]]; then
  [[ -d "$SRC" ]] || { echo "--skip-build, but $SRC does not exist" >&2; exit 1; }
  echo "skipping build; signing the existing $SRC"
else
  "$ROOT/scripts/build.sh" > /dev/null
fi

mkdir -p "$ARTIFACTS"

# --- preflight lint: fail here, not after AMO has burned the version number ---
# --self-hosted is correct for the unlisted channel and pre-authorises a future
# browser_specific_settings.gecko.update_url (see firefox/README.md).
echo "linting $SRC ..."
"${WEB_EXT[@]}" lint \
  --source-dir "$SRC" \
  --artifacts-dir "$ARTIFACTS" \
  --self-hosted \
  --no-config-discovery \
  ${LINT_STRICT[@]+"${LINT_STRICT[@]}"}

# --- sign ---------------------------------------------------------------------
# web-ext builds its own zip from --source-dir, so do not hand it the one build.sh
# made. Set --timeout and --approval-timeout together: passing only --timeout also
# shrinks the approval window (see lib/cmd/sign.js).
echo "submitting TD;DW ${VERSION} to AMO (channel: unlisted) ..."
"${WEB_EXT[@]}" sign \
  --source-dir "$SRC" \
  --artifacts-dir "$ARTIFACTS" \
  --channel unlisted \
  --no-config-discovery \
  --timeout 300000 \
  --approval-timeout 900000

XPI="$(ls -t "$ARTIFACTS"/*.xpi 2>/dev/null | head -n 1 || true)"
if [[ -n "$XPI" ]]; then
  cat <<EOF

signed: $XPI

Install it in release Firefox on any machine:
  about:addons -> gear icon -> Install Add-on From File -> pick that .xpi
EOF
else
  echo "sign reported success but no .xpi landed in $ARTIFACTS; check the log above" >&2
  exit 1
fi
