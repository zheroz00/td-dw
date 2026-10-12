// Minimal shims so the plain-script content-script files (no ES module syntax,
// no exports) can be imported and exercised under node:test. Each file attaches
// itself to globalThis.TDDW, same contract as the real content-script loader.

export async function loadContentScript(relPath) {
  globalThis.TDDW = globalThis.TDDW || { adapters: [] };
  // Node ships a built-in global `navigator` whose `.language` is a read-only
  // getter, so a plain `??=` (or assignment) can't stub it for tests that need
  // to flip the UI language. Replace it outright with a writable plain object;
  // the content scripts only ever read `.language` off it.
  const languageDescriptor = globalThis.navigator
    ? Object.getOwnPropertyDescriptor(globalThis.navigator, 'language')
    : undefined;
  if (!globalThis.navigator || !(languageDescriptor?.writable || languageDescriptor?.set)) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      writable: true,
      configurable: true
    });
  }
  globalThis.chrome ??= { storage: { local: { get: async () => ({}) } } };

  // Dynamic import() caches by resolved URL, so re-loading the same file across
  // tests just returns the already-populated registry. That's fine: the
  // functions these files attach are pure re-registrations of the same logic.
  await import(new URL('../' + relPath, import.meta.url));
  return globalThis.TDDW;
}
