# TD;DW on your TV

Press a button on your Android TV remote while Jellyfin is playing and get a spoiler-free "what did I miss" recap on screen, up to the exact moment you're at. Your phone can open the same recap and ask follow-up questions.

> 📸 **Screenshot needed:** the TV view on a 1080p TV mid-recap -> docs/images/tv-recap.png

This is the TV side of [TD;DW](../README.md). A browser extension can't run on a TV, and a Jellyfin plugin can't add screens to the native apps, so this is a small web service you run on your own network. It reuses the extension's recap engine, so the recaps work the same way.

## Before you start (read this first)

- **LAN only, no HTTPS.** The service speaks plain HTTP. Put it behind a reverse proxy with TLS before you expose it beyond your home network.
- **The key lives in the URL.** The TV button and the phone bookmark both carry `?key=...`, so treat them like passwords. Anyone with the link can trigger recaps (and spend your LLM credits).
- **Needs Jellyfin 10.9 or newer.** The resume-point fallback uses an endpoint that older servers don't have.
- **Image-only subtitles get a memory recap.** If a title only has PGS or VOBSUB subtitles (pictures of text), there is no text to read, so the recap comes from the model's memory and the page says so with a "From the model's memory, may be imperfect" badge. Text subtitles (SRT, ASS, WebVTT and so on) give a transcript-grade recap.
- **The recap pauses the TV.** Set `PAUSE_ON_RECAP=false` if you'd rather it didn't.
- **You need an LLM endpoint.** Any OpenAI-compatible one works. See [Choosing a model](#choosing-a-model) before you pick, because a thinking model on a small local setup can be slow or return nothing.

Tested against Jellyfin 12.2 with an NVIDIA Shield running "Jellyfin for Android TV". That app reports its device name as `SHIELD`, which is what `JELLYFIN_DEVICE=SHIELD` matches.

## Setup

You need Docker with Compose, and the whole repo cloned (the image builds from the repo root, because it reuses the extension's code).

1. **Create a Jellyfin API key.** In Jellyfin, go to Dashboard > API Keys and add one. Give TD;DW its own, for example `td-dw-tv`, so you can revoke it without touching anything else.
2. **Create your settings file.** From the `tv/` folder:

       cp .env.example .env

   Fill in `.env` using the table below. Read [Choosing a model](#choosing-a-model) before you pick the `LLM_` values. `.env` holds secrets and is git-ignored, so don't commit it. To make a `TDDW_TV_KEY`, run `openssl rand -hex 24`.
3. **Start it.**

       docker compose up -d --build

4. **Check it's alive.**

       curl http://<host>:8795/healthz

   You should get `{"ok":true}`. If the container exits straight away, run `docker compose logs`: bad settings are reported all at once, with the exact variable names.

`<host>` is the machine running the container. If you changed `PORT`, use that instead of 8795 everywhere.

### Configuration

| Var | Required | Default | Notes |
|---|---|---|---|
| `JELLYFIN_URL` | yes | | Jellyfin as the container sees it, e.g. `http://jellyfin.local:8096`. Not `localhost`. |
| `JELLYFIN_API_KEY` | yes | | The key from step 1. |
| `JELLYFIN_DEVICE` | no | (any) | Part of the TV's device or client name, e.g. `SHIELD`. Empty means whichever session played most recently. |
| `TDDW_TV_KEY` | yes | | Shared secret in the button and bookmark URLs. At least 16 characters, letters, digits, `-` and `_` only. |
| `LLM_BASE_URL` | yes | | Any OpenAI-compatible endpoint. `.env.example` starts with `https://openrouter.ai/api/v1`. |
| `LLM_API_KEY` | no | | Leave blank for local endpoints. OpenRouter needs one. |
| `LLM_MODEL` | yes | | `.env.example` starts with `google/gemini-3.8-flash`. |
| `LLM_REASONING_EFFORT` | no | (empty) | `none`, `minimal`, `low`, `medium` or `high`. Empty uses TD;DW's per-request defaults. See [Choosing a model](#choosing-a-model). |
| `SUMMARY_LENGTH` | no | `medium` | `short`, `medium` or `detailed`. |
| `TRANSCRIPT_BUDGET` | no | `standard` | `standard` for cloud models, `local` for small-context models. |
| `SPOILER_FREE_ANSWERS` | no | `true` | Keeps follow-up answers behind your timestamp. |
| `PAUSE_ON_RECAP` | no | `true` | Pause the TV when a recap starts. |
| `SUBTITLE_LANG` | no | `en` | Preferred subtitle language. |
| `PORT` | no | `8795` | Also sets the published port in `docker-compose.yml`. |

## Choosing a model

**Recommended: a fast cloud model.** That's the default in `.env.example` (OpenRouter with `google/gemini-3.8-flash`). Recaps take a few seconds, and a full-length episode fits with `TRANSCRIPT_BUDGET=standard`. The trade-off is that a cloud model sees the subtitles up to your position, along with your follow-up questions.

**Local models work too.** Point `LLM_BASE_URL` at any OpenAI-compatible endpoint, for example Ollama at `http://<host>:11434/v1`, and leave `LLM_API_KEY` blank. Two things bit me when I tried it:

1. **Thinking models can think until they run out of context and return nothing.** Set `LLM_REASONING_EFFORT=none` for them. In my testing, a local 26B model went from no answer after more than two minutes to a good recap in about 8 seconds.
2. **Ollama's default context is small.** It was 8k tokens on my test box. Use `TRANSCRIPT_BUDGET=local` (about 60,000 characters of subtitles) and raise Ollama's context with `OLLAMA_CONTEXT_LENGTH` to about 20000 or more. Otherwise a long episode loses its beginning silently, and the recap reads like the story started halfway through.

Whatever you pick, the LLM request gives up after 2 minutes and the page says so in plain words.

## The remote button

This uses TV Quick Actions Pro on Android TV to bring up the recap from a spare remote button.

**Recommended: the small TD;DW Recap app.** It has no browser or ads, keeps the player paused underneath, and one press of Back resumes your video. See [android/README.md](android/README.md).

**Or use a browser, with nothing to install:**

1. **Set a default browser on the TV first.** If you don't, Android asks which browser to use every single time you press the button.
2. In TV Quick Actions Pro, create a new action:
   - Action type: **request**
   - Method: **GET**
   - URL: `http://<host>:8795/?view=tv&key=<TDDW_TV_KEY>`
   - Tick **Open this URL in browser**
3. Map the action to a spare remote button.

Press it mid-episode. The page appears right away with a "Catching you up..." loader and fills in when the recap is ready. Press **Back** on the remote to return to Jellyfin. The TV view has no buttons or text boxes on purpose, so there's nothing for the D-pad to get stuck on.

## The phone bookmark

Open `http://<host>:8795/?key=<TDDW_TV_KEY>` on your phone and add it to your home screen.

It shows the latest recap (and waits if one is still running), keeps a thread of your follow-up questions and answers, and has a **New recap** button that starts a fresh one from the phone. That also pauses the TV, same as the remote button.

> 📸 **Screenshot needed:** phone view with a follow-up answer -> docs/images/tv-phone.png

## How it works

When you press the button, the service asks Jellyfin which video is playing and how far in you are. If something is live it pauses it, downloads that title's text subtitles, keeps only the lines up to your position, and hands them to the same recap engine the extension uses. The result goes to the page as bullets with `[m:ss]` time chips. If the Jellyfin app stops its session when the browser opens over it, the service falls back to your most recent resume point instead and labels the recap "from your resume point". That position is whatever the app last reported, so it can be a little behind where you actually paused. Jellyfin also lists the API key itself as a session, and the service ignores it. The latest recap and its follow-up thread are kept in memory, so a restart clears them.

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

## Troubleshooting

- **"Nothing is playing in Jellyfin right now"** (or the same message with your device name in it). The service found no video session and no resume point. Set `JELLYFIN_DEVICE` to part of your TV's name as Jellyfin shows it (Dashboard > Devices), or clear it to accept any device. Also check that the Jellyfin app on the TV is signed in as a real user and has played something.
- **"Jellyfin rejected the API key".** Jellyfin answers 401 or 403 when `JELLYFIN_API_KEY` is wrong, was revoked, or is missing. Create a fresh key in Dashboard > API Keys, put it in `.env` and restart with `docker compose up -d`.
- **"JELLYFIN_URL should be the server address only".** Use the server address, like `http://jellyfin.local:8096`, not the page you see in the browser (`.../web/#/home.html`). A `#` or `?` in the URL is rejected at startup. A leftover `/web/` path gets through that check and shows up at the first button press as "Jellyfin answered with something that isn't JSON" (a proxy login page does the same), so strip it too. A real sub-path like `https://example.com/jellyfin` is fine.
- **"Can't reach Jellyfin at ...".** Inside the container, `localhost` is the container itself. Use the Jellyfin machine's LAN address or hostname in `JELLYFIN_URL`, and make sure the container can route to it.
- **"Missing or wrong key".** The URL is missing `?key=...` or has a typo. Copy the full link from your setup again. The key in the URL has to match `TDDW_TV_KEY` exactly.
- **Recaps are slow, or "The model took longer than N seconds".** Almost always a thinking model. Use a faster model, or set `LLM_REASONING_EFFORT=none` (or `low`) so it doesn't think for minutes. See [Choosing a model](#choosing-a-model).
- **"LLM_API_KEY is required for OpenRouter and Gemini".** The service refuses to start when `LLM_BASE_URL` points at OpenRouter or Gemini and `LLM_API_KEY` is blank. `.env.example` ships with the key blank, so paste yours in and restart. Only local endpoints can go without one. A key that is filled in but wrong shows up later as a 401 from the endpoint.
- **The recap says "From the model's memory, may be imperfect".** There was no subtitle text to read, so the recap comes from the model's memory. Treat it as a refresher. Common causes:
  - The title has no text subtitles at all (only PGS or VOBSUB images, or none). `SUBTITLE_LANG` is only a preference: if the title has a text track in any language, it gets used.
  - You pressed the button before the first subtitle line, so there was nothing to read yet.
  - The subtitle download failed. The page then also shows "Couldn't load the subtitles (...)" with the reason, and `docker compose logs` has the details.
