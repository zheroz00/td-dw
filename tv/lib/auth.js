import { createHash, timingSafeEqual } from 'node:crypto';

// The page URL carries the key as ?key= (a TV button or phone bookmark can't
// set headers); the page's own API calls send it as a Bearer header.

// Hashing both sides gives equal-length buffers, so timingSafeEqual never
// throws on a length mismatch and the comparison time says nothing about it.
export function keyMatches(given, expected) {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export function isAuthorized(req, url, expected) {
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '')?.[1];
  return keyMatches(bearer, expected) || keyMatches(url.searchParams.get('key'), expected);
}
