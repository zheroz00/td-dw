// Fake fetch for the TV service tests: maps "METHOD url" to a canned response.
// A route value can be a string (text 200), { status } alone (empty response
// with that status), an Error (network failure) or anything else (JSON 200).
// Unknown routes answer 404.
export function fakeFetch(routes) {
  const calls = [];
  async function fetchImpl(url, init = {}) {
    const method = init.method || 'GET';
    calls.push({ url: String(url), method, headers: init.headers || {} });
    const key = `${method} ${url}`;
    if (!Object.hasOwn(routes, key)) return new Response(null, { status: 404 });
    const value = routes[key];
    if (value instanceof Error) throw value;
    if (typeof value === 'string') return new Response(value, { status: 200 });
    const keys = value && typeof value === 'object' ? Object.keys(value) : [];
    if (keys.length === 1 && keys[0] === 'status') return new Response(null, { status: value.status });
    return Response.json(value);
  }
  fetchImpl.calls = calls;
  return fetchImpl;
}
