// Minimal Jellyfin REST client for the TV service: only the calls a recap
// needs. Auth is a server API key (Dashboard > API Keys) sent in the
// documented `Authorization: MediaBrowser Token="..."` header.

export const TICKS_PER_SECOND = 1e7; // Jellyfin ticks are 100-ns units

export class JellyfinError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'JellyfinError';
    this.status = status;
  }
}

export function createJellyfinClient({ url, apiKey }, fetchImpl = globalThis.fetch) {
  const headers = { Authorization: `MediaBrowser Token="${apiKey}"` };
  const id = (value) => encodeURIComponent(value);

  // `url` has no trailing slash (config.js trims it) and every path starts with
  // '/', so plain concatenation keeps a sub-path like https://host/jellyfin.
  async function request(path, method = 'GET') {
    let res;
    try {
      res = await fetchImpl(`${url}${path}`, { method, headers });
    } catch (err) {
      throw new JellyfinError(`Can't reach Jellyfin at ${url} (${err.message})`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new JellyfinError('Jellyfin rejected the API key. Check JELLYFIN_API_KEY.', res.status);
    }
    if (!res.ok) {
      throw new JellyfinError(`Jellyfin ${method} ${path.split('?')[0]} failed (${res.status})`, res.status);
    }
    return res;
  }

  const json = async (path) => (await request(path)).json();

  return {
    getSessions: () => json('/Sessions'),

    getItem: (userId, itemId) => json(`/Items/${id(itemId)}?userId=${id(userId)}`),

    async getResumeItem(userId) {
      const page = await json(`/UserItems/Resume?userId=${id(userId)}&limit=1&mediaTypes=Video`);
      return page?.Items?.[0] || null;
    },

    async getSubtitleVtt(itemId, mediaSourceId, streamIndex) {
      const path = `/Videos/${id(itemId)}/${id(mediaSourceId)}/Subtitles/${Number(streamIndex)}/Stream.vtt`;
      return (await request(path)).text();
    },

    async pause(sessionId) {
      await request(`/Sessions/${id(sessionId)}/Playing/Pause`, 'POST');
    }
  };
}
