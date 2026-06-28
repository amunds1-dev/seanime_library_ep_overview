# Episode Overview Bar — Seanime plugin

Adds a 3-layer progress bar with exact counts to anime **library cards** (and, next,
the **anime detail page**), so you can see at a glance:

- **Total** episodes for the show/season (grey track, split into equal segments)
- **Aired** episodes so far (dark fill)
- **In library** — episodes present locally (slim dark-green bottom strip)
- **Watched** — your AniList progress (light-green fill)

Plus a caption: `24 total · 18 aired · 12 in library · 9 watched`.

## Files

- `episode-overview-bar.json` — the extension manifest (this is the URL users install)
- `plugin.ts` — the plugin source code (referenced by `payloadURI`)

## Install (development / local testing)

1. Make sure your Seanime version supports plugins and that the plugin UI is enabled
   in Settings → Extensions.
2. In `episode-overview-bar.json`, the `isDevelopment` flag is `true`. Set
   `payloadURI` to the **absolute local path** of `plugin.ts` on this machine, e.g.
   `file:///C:/Users/kanth/ClaudeCode/Seanime_Ep_Bar/plugin.ts`
   (or the path your Seanime build expects for dev plugins).
3. In Seanime, add the extension via the manifest file (Extensions → add from file/URL),
   grant the requested permissions (`anilist`, `anime`), then reload.
4. Open the library — bars should appear on cards. Use the browser devtools console
   to see any `[episode-overview-bar]` log lines.

## Publish (hosting on your GitHub repo)

1. Push both files to your repo.
2. In the manifest: remove `isDevelopment`, and set `payloadURI` to the **raw** GitHub
   URL of `plugin.ts`, e.g.
   `https://raw.githubusercontent.com/<you>/<repo>/main/plugin.ts`
3. Share the **raw URL of the manifest** (`episode-overview-bar.json`) — that's what
   users add as a custom extension.

## Still to verify against your Seanime build

Search `plugin.ts` for `VERIFY:`. Card selection is now confirmed from the v3.8.7
source; two API-side items remain:

1. ~~Card selector~~ — **confirmed** against v3.8.7: cards are
   `div[data-media-entry-card-container][data-media-id="NN"][data-media-type="anime"]`.
2. **Local library count** — uses `$anime.getEpisodeCollection(id).episodes.length`.
   Confirm this equals downloaded episodes on your build (and that the `anime`
   permission scope is the correct one for it).
3. **Detail page container** — the `onNavigate('/entry')` branch is stubbed; the entry
   route is `/entry?id=NN`. Phase 2 will append a larger bar near
   `[data-media-entry-card-title-section]`'s detail-page equivalent.

The only confirmation left is a quick devtools check on your running instance that the
bar appears and the counts look right.
