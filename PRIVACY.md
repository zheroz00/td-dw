# TD;DW privacy policy

Last updated: 2026-11-14

TD;DW is a browser extension that recaps the video you're watching and summarizes the article
you're reading. It has no servers of its own, no accounts, no analytics and no telemetry. The
developer never receives any of your data.

## What leaves your device, and when

Nothing is sent until you ask for it by clicking the TD;DW toolbar button, pressing its keyboard
shortcut, or typing a follow-up question. Then TD;DW sends a request to the AI model provider
you configured in its settings (OpenRouter by default, or any other endpoint you enter):

- **Video recap:** the video's title, episode info, your playback position, and, when available,
  the subtitles or captions up to that position.
- **Article summary:** the article's title, byline, site name and main text, read from the page
  you clicked on. The page address is not sent.
- **Follow-up questions:** your question, the recap or summary it's about, and the same subtitles
  or article text, so the model can answer from them.

That provider processes the request under its own privacy policy. Pick one you trust, or point
TD;DW at a model you run yourself and nothing leaves your network.

## What is stored

Your settings (provider, model, API key, display preferences, and optional Jellyfin server
address) are saved in your browser's local extension storage on your device. Your API key is only
ever sent to the provider it belongs to, as the authorization header on your own requests.
Recaps, summaries and follow-up conversations are kept in memory while the panel is open and are
discarded when you close it. Nothing is synced or shared.

## What TD;DW never does

- Read pages in the background, or any page other than the one you clicked on.
- Track your browsing history or the sites you visit.
- Sell, share or transfer your data to anyone, or use it for advertising or credit decisions.

## Optional TV service

The repository also contains an optional TV recap service (`tv/`) that you host yourself. It
sends the same kind of request (title, subtitles up to your position, your questions) from your
own server to the provider you configure, and, for YouTube recaps, looks up the video's captions
on youtube.com. It reports to no one else.

## Contact

Questions or concerns: open an issue at https://github.com/zheroz00/td-dw/issues.
