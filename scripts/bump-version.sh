#!/usr/bin/env bash
# Bump the version in BOTH manifests at once.
#
# AMO refuses to sign a version number it has already seen for this add-on id, so
# every signed build needs a fresh one, and the Chrome and Firefox manifests must
# agree (scripts/build.sh fails the build if they drift).
#
#   scripts/bump-version.sh            0.1.0 -> 0.1.1   (patch is the default)
#   scripts/bump-version.sh minor      0.1.0 -> 0.2.0
#   scripts/bump-version.sh major      0.1.0 -> 1.0.0
#   scripts/bump-version.sh 0.4.2      explicit
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUMP="${1:-patch}"

node -e '
  const fs = require("fs");
  const [bump, ...files] = process.argv.slice(1);

  // Bad input here is a typo, not a crash. Report it as one line on stderr
  // rather than a stack trace.
  const main = () => {

  // The leading quote is what keeps this off "manifest_version" and
  // "strict_min_version": in those, the character before `version` is an
  // underscore, not a quote. A text edit rather than a JSON round-trip, so the
  // hand formatting of the manifests survives untouched.
  const RE = /("version"\s*:\s*")([^"]*)(")/;

  // addons-linter isValidVersionString: one to four dot-separated parts, each
  // either 0 or a non-leading-zero integer of up to nine digits. No letters.
  const VALID = /^(0|[1-9][0-9]{0,8})(\.(0|[1-9][0-9]{0,8})){0,3}$/;

  const manifests = files.map((f) => {
    const text = fs.readFileSync(f, "utf8");
    const m = text.match(RE);
    if (!m) throw new Error(`no "version" key found in ${f}`);
    return { f, text, current: m[2] };
  });

  const [first, ...rest] = manifests;
  for (const m of rest) {
    if (m.current !== first.current) {
      throw new Error(
        `manifests already disagree: ${first.f} is ${first.current}, ` +
        `${m.f} is ${m.current}. Reconcile that by hand first.`);
    }
  }

  let next;
  if (["major", "minor", "patch"].includes(bump)) {
    if (!VALID.test(first.current)) {
      throw new Error(`cannot auto-bump from "${first.current}"; pass an explicit version`);
    }
    const parts = first.current.split(".").map(Number);
    while (parts.length < 3) parts.push(0);
    const i = { major: 0, minor: 1, patch: 2 }[bump];
    parts[i] += 1;
    for (let j = i + 1; j < parts.length; j++) parts[j] = 0;
    next = parts.join(".");
  } else {
    next = bump;
  }

  if (!VALID.test(next)) {
    throw new Error(
      `"${next}" is not a valid add-on version: one to four dot-separated ` +
      `integers, no leading zeros, no letters`);
  }
  if (next === first.current) throw new Error(`already at ${next}`);

  // Everything is read and validated before anything is written.
  for (const m of manifests) fs.writeFileSync(m.f, m.text.replace(RE, `$1${next}$3`));
  console.log(`${first.current} -> ${next}`);
  for (const m of manifests) console.log(`  updated ${m.f}`);
  };

  try { main(); }
  catch (e) { console.error(e.message); process.exit(1); }
' "$BUMP" "$ROOT/manifest.json" "$ROOT/firefox/manifest.json"

# Prove it. This is the same drift check that guards every build and every sign.
"$ROOT/scripts/build.sh" > /dev/null
echo "drift check passed. Next: scripts/sign-firefox.sh"
