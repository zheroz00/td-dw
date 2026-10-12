# Build context is the repo root (see docker-compose.yml): the service reuses
# the extension's recap code from background/ and content/adapters/.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# package.json carries "type": "module", which every file below relies on.
COPY package.json ./
COPY background/config.js background/llm-client.js ./background/
COPY background/providers/ ./background/providers/
COPY content/adapters/jellyfin-subtitles.js content/adapters/transcript-cap.js ./content/adapters/
COPY tv/server.js ./tv/
COPY tv/lib/ ./tv/lib/
COPY tv/public/ ./tv/public/

USER node
EXPOSE 8795
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8795}/healthz" >/dev/null || exit 1
CMD ["node", "tv/server.js"]
