# TD;DW on the TV: design

Date: 2026-10-12. Status: approved in chat, pending spec review.

## Goal

Press one remote button while Jellyfin is playing on an Android TV box (tested target: NVIDIA
Shield, Jellyfin for Android TV) and get the same spoiler-free "what did I miss" recap the
browser extension gives, shown as a readable page on the TV. A phone can open the same recap
and ask follow-up questions.

A browser extension can't run on the TV, and a Jellyfin server plugin can't add UI to native
clients, so this is a small LAN web service instead.

## What we already know (verified 2026-10-12)

- Jellyfin's `/Sessions` exposes the TV's `NowPlayingItem` and `PlayState.PositionTicks`.
- `POST /Sessions/{id}/Message` (DisplayMessage) reaches the TV but the Android TV app ignores
  `TimeoutMs` and shows one unformatted blurb for a few seconds. Not used in v1.
- TV Quick Actions Pro can fire a GET with "Open this URL in browser". A static recap page
  opened in a TV browser looked good.
- Open risk: opening the browser sends the Jellyfin app to the background. If the app stops
  its session, the live position may be gone by the time the page asks. Verified on the
  Shield as the first implementation step; the resume-point fallback below covers it either way.

## Flow

```
Remote button -> Quick Actions GET (open in browser)
  -> GET /?view=tv&key=...           page shell renders instantly ("Catching you up...")
  -> POST /api/recap                 find session -> pause -> subtitles up to position
                                     -> existing provider (transcript | knowledge) -> LLM
  -> page renders bullets            Back on the remote returns to Jellyfin

Phone home-screen bookmark
  -> GET /?key=...                   latest recap (waits if one is running)
  -> POST /api/ask                   follow-up answer, appended to the thread
  -> "New recap" button              POST /api/recap (pauses the TV)
```

## Layout

```
tv/
  server.js          entry: load config, wire the pieces, start the node:http server
  lib/http-app.js    routing, auth check, body limits, security headers
  lib/config.js      env vars -> frozen config; exits with a clear list of missing/invalid vars
  lib/auth.js        key check (?key= or Authorization: Bearer), constant-time compare
  lib/jellyfin.js    Jellyfin client: sessions, item, resume point, subtitle VTT, pause
  lib/now-playing.js picks the session/item/position (live, else resume point)
  lib/recap.js       builds videoState, runs the extension's providers and Q&A prompt
  lib/store.js       latest recap + Q&A thread in memory, in-flight dedupe
  lib/shared.js      loads the extension's content-script parsers into Node
  public/index.html  one page, two views (tv, phone)
  public/app.js      fetches the recap, renders it, ask box, new-recap button
  public/render.js   recap text -> safe DOM data (bullets, [m:ss] chips, **bold**); unit tested
  public/styles.css
  Dockerfile         build context = repo root (needs background/ and content/adapters/)
  docker-compose.yml
  .env.example
  README.md          setup: API key, env, compose, Quick Actions button, phone bookmark
test/tv/*.test.js    node:test, runs with the existing `npm test`
```

Zero npm dependencies, Node 22 (the repo already targets Node >= 20 with built-in `fetch`).

## Reused from the extension (no copies)

- `background/llm-client.js` `chatCompletion` (imports cleanly in Node; `chrome` is only touched
  inside functions the service never calls).
- `background/providers/index.js` `pickProvider` and the transcript/knowledge providers.
- `background/providers/prompts.js` `buildQuestionMessages`.
- `content/adapters/jellyfin-subtitles.js` `parseJellyfinSubtitles` and
  `content/adapters/transcript-cap.js` `capTranscript` / `TRANSCRIPT_BUDGET_CHARS`, loaded as
  side-effect imports onto `globalThis.TDDW` by `lib/shared.js` (the same way `test/helpers.js`
  loads them).

Targeted refactor: `pickSubtitleStream` moves out of the Jellyfin adapter's closure into
`jellyfin-subtitles.js` as `TDDW.pickJellyfinSubtitleStream(streams, lang)`. The adapter passes
`navigator.language`; the server passes `SUBTITLE_LANG`. Existing tests keep passing, plus a
test for the moved function.

## Routes

All routes except `/healthz` and `/static/*` require the key (`?key=` or
`Authorization: Bearer <key>`). The page reads `key` from its own URL and sends it as a Bearer
header on API calls.

| Route | Purpose |
|---|---|
| `GET /?view=tv` | TV view: big type, starts a fresh recap on load, elapsed-seconds loader, no inputs or buttons (nothing for the D-pad to get stuck in), footer "Press Back to return" |
| `GET /` | Phone view: latest recap, Q&A thread, ask box, New recap button |
| `POST /api/recap` | Run a fresh recap (joins an in-flight one instead of starting a second) |
| `GET /api/latest` | Latest recap + thread; waits on an in-flight recap; 404 when there is none yet |
| `POST /api/ask` | `{question}` (max 2000 chars) -> answer; 409 when there is no recap yet |
| `GET /healthz` | Liveness for Docker |
| `GET /static/*` | `app.js`, `render.js`, `styles.css` |

JSON bodies are capped at 16 KB. Responses carry a `Content-Security-Policy: default-src 'self'`
header; recap and answer text is rendered as text nodes, never `innerHTML`.

## Picking what's playing (`lib/now-playing.js`)

1. `GET /Sessions`. Candidates = sessions with a `NowPlayingItem`. If `JELLYFIN_DEVICE` is set,
   keep only sessions whose `DeviceName` or `Client` contains it (case-insensitive). Take the
   most recent `LastActivityDate`. Position = `PlayState.PositionTicks`.
2. Fallback (no playing candidate): take the matching device's session (idle is fine, it still
   carries `UserId`), or the most recently active session when no device filter is set, then
   `GET /UserItems/Resume?userId=...&limit=1` (Jellyfin 10.9+ path; confirmed in the Shield check). Position = the item's
   `UserData.PlaybackPositionTicks`. The recap is labelled "from your resume point".
3. Nothing found: a friendly "Nothing is playing in Jellyfin right now" error.
4. Live session + `PAUSE_ON_RECAP=true` (default): `POST /Sessions/{id}/Playing/Pause`. A pause
   failure is logged and does not block the recap.

## Building the recap (`lib/recap.js`)

- `videoState` matches the extension's shape: `service: 'Jellyfin'`, `title` (`SeriesName` for
  episodes, else `Name`), `episodeInfo` (`S1:E2 - Name`), `currentTimeSeconds`,
  `durationSeconds` (`RunTimeTicks`), `transcript`.
- Transcript: pick a text subtitle stream (`IsTextSubtitleStream`), fetch
  `/Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/Stream.vtt`, parse up to the position,
  cap to `TRANSCRIPT_BUDGET`. No text stream (PGS/VOBSUB only) means `transcript: null`, so
  `pickProvider` falls back to the knowledge provider ("From memory" badge).
- LLM config comes from env (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `SUMMARY_LENGTH`,
  `SPOILER_FREE_ANSWERS`), shaped like the extension's config object.
- Follow-ups use `buildQuestionMessages` with the stored `videoState`, recap text and thread.

## Store (`lib/store.js`)

One slot: `{ id, createdAt, videoState, result, fromResumePoint, history[] }`, held in memory
(a restart clears it; that's fine for v1). A recap request while one is running returns the
same promise. History is capped at 50 turns (the prompt already only sends the last 10).

## Config (`tv/.env.example`)

| Var | Required | Default | Notes |
|---|---|---|---|
| `JELLYFIN_URL` | yes | | e.g. `http://jellyfin.local:8096` |
| `JELLYFIN_API_KEY` | yes | | its own key (Dashboard > API Keys), not borrowed |
| `JELLYFIN_DEVICE` | no | (any) | substring of the TV's device name or client, e.g. `SHIELD` |
| `TDDW_TV_KEY` | yes | | shared secret in the button/bookmark URL, at least 16 chars |
| `LLM_BASE_URL` | yes | | any OpenAI-compatible endpoint |
| `LLM_API_KEY` | no | | blank for local endpoints |
| `LLM_MODEL` | yes | | |
| `SUMMARY_LENGTH` | no | `medium` | `short`, `medium`, `detailed` |
| `TRANSCRIPT_BUDGET` | no | `standard` | `standard` (cloud), `local` (small-context models) |
| `SPOILER_FREE_ANSWERS` | no | `true` | follow-ups stay behind the timestamp |
| `PAUSE_ON_RECAP` | no | `true` | |
| `SUBTITLE_LANG` | no | `en` | preferred subtitle language |
| `PORT` | no | `8795` | |

`.gitignore` gets `!.env.example`, because its existing `.env.*` rule would hide the example.

## Errors

- Missing or invalid env: the server refuses to start and lists every problem at once.
- Jellyfin 401/403: "Jellyfin rejected the API key". Unreachable: "Can't reach Jellyfin at URL".
- LLM failures and "model doesn't know this title" reuse the providers' existing messages.
- Every error is shown on the page in plain words; nothing fails silently.
- Logs never include API keys, the TV key, or transcript text.

## Testing

- Unit (`node:test`, fake `fetch`): session picking (live, device filter, resume fallback,
  nothing playing), episode vs movie `videoState`, subtitle stream choice, auth (missing, wrong,
  query, header), render (HTML stays text, bold, chips, list-marker stripping), store
  (in-flight dedupe, history cap), config validation.
- Live: container on the Docker host, `curl` the API while something plays on the Shield, then the
  Quick Actions button, then the phone bookmark with a follow-up question.

## Out of scope for v1

DisplayMessage popups, an Android TV app, several TVs or users at once, HTTPS (LAN only;
put it behind a reverse proxy if it ever leaves the LAN), seeking from timestamp chips,
recap history across restarts.
