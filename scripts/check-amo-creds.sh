#!/usr/bin/env bash
# Check that the AMO credentials file is present and well-formed, without ever
# printing the values. Run this before scripts/sign-firefox.sh if you want to be
# sure the file is right.
#
#   scripts/check-amo-creds.sh
#
# Reports shape only: whether each variable is set, whether the key matches AMO's
# JWT issuer format, and the secret's length. Never the secret itself.
set -euo pipefail

CRED_FILE="${TDDW_AMO_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/td-dw/amo.env}"

if [[ ! -f "$CRED_FILE" ]]; then
  echo "missing: $CRED_FILE" >&2
  echo "See firefox/README.md, 'Credentials'." >&2
  exit 1
fi

perms="$(stat -c '%a' "$CRED_FILE" 2>/dev/null || echo '')"
if [[ -n "$perms" && "${perms: -2}" != "00" ]]; then
  echo "warning: $CRED_FILE is group/world readable. Fix with:" >&2
  echo "  chmod 600 $CRED_FILE" >&2
fi

# Source in a subshell so nothing leaks into the caller's environment, and so a
# malformed file cannot clobber anything here.
(
  set +e
  # shellcheck disable=SC1090
  . "$CRED_FILE" 2>/dev/null
  set -e

  fail=0

  if [[ -z "${WEB_EXT_API_KEY:-}" ]]; then
    echo "WEB_EXT_API_KEY   not set"
    fail=1
  elif [[ "$WEB_EXT_API_KEY" =~ ^user:[0-9]+:[0-9]+$ ]]; then
    echo "WEB_EXT_API_KEY   ok (JWT issuer format)"
  else
    echo "WEB_EXT_API_KEY   set, but does not look like AMO's JWT issuer"
    echo "                  expected the form user:12345678:123"
    fail=1
  fi

  if [[ -z "${WEB_EXT_API_SECRET:-}" ]]; then
    echo "WEB_EXT_API_SECRET not set"
    fail=1
  elif [[ "$WEB_EXT_API_SECRET" =~ ^[0-9a-f]{40,}$ ]]; then
    echo "WEB_EXT_API_SECRET ok (${#WEB_EXT_API_SECRET} hex chars)"
  else
    echo "WEB_EXT_API_SECRET set, but does not look like AMO's JWT secret"
    echo "                   expected a long lowercase hex string"
    fail=1
  fi

  if [[ "$fail" -ne 0 ]]; then
    cat >&2 <<EOF

The file must export BOTH values as shell variables, for example:

  export WEB_EXT_API_KEY="user:12345678:123"
  export WEB_EXT_API_SECRET="the long hex secret, shown only once"

A bare value with no variable name will not work. Both come from
https://addons.mozilla.org/developers/addon/api/key/ (JWT issuer and JWT secret).
EOF
    exit 1
  fi

  echo
  echo "credentials look good. Next: scripts/sign-firefox.sh"
)
