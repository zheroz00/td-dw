// TD;DW TV: the recap service behind the remote button. Wires the real
// Jellyfin client, recap engine and store into the HTTP app and listens.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from './lib/config.js';
import { createJellyfinClient } from './lib/jellyfin.js';
import { createRecapService } from './lib/recap.js';
import { createStore } from './lib/store.js';
import { createApp } from './lib/http-app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(err.message);
  process.exit(1);
}

const jellyfin = createJellyfinClient(config.jellyfin);
const recapService = createRecapService({ jellyfin, config });
const store = createStore(() => recapService.recap());
const app = createApp({
  config,
  store,
  recapService,
  publicDir: fileURLToPath(new URL('./public/', import.meta.url))
});

const server = http.createServer(app);
server.listen(config.port, () => {
  console.log(`[tv] TD;DW TV listening on port ${config.port}`);
});

// `docker stop` sends SIGTERM: finish open requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
