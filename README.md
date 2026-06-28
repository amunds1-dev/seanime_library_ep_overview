# Episode Overview Bar — Seanime plugin

Adds a 3-layer progress bar with exact counts to your anime **library cards** and the
**anime detail page**, so you can see at a glance:

- **Total** episodes for the show/season — grey track, split into equal segments
- **Aired** episodes so far — light fill
- **In library** — episodes available locally (or via the Nakama host) — slim dark-green strip
- **Watched** — your AniList progress — light-green fill

Plus a caption: `24 total · 18 aired · 12 in library · 9 watched`.

## Files

| File | Purpose |
|------|---------|
| `episode-overview-bar.json` | Extension manifest (the URL users install) |
| `plugin.ts` | Plugin source |
| `types/*.d.ts` | Seanime's official plugin typings (for editor/typecheck only) |

## How it works

All data comes from a single `ctx.anime.getAnimeEntry(mediaId)` call per entry
(`$app.Anime_Entry`), which needs **no permission scopes** and is **Nakama-aware**:

- **Total** = `media.episodes`
- **Aired** = `media.nextAiringEpisode.episode − 1` (or all, if finished/no schedule)
- **Watched** = `listData.progress`
- **In library** = `libraryData.mainFileCount`; for Nakama entries it also considers
  `nakamaLibraryData.mainFileCount` (host's shared episodes) and takes the larger value

Injection points were confirmed against the **v3.8.7 (Kanata)** frontend source:

- Grid: `div[data-media-entry-card-container][data-media-id][data-media-type="anime"]`
- Detail: inserted before `[data-anime-entry-page-episode-list-view]`, media id read
  from the `[data-anime-entry-page]` wrapper's serialized `data-media`

Both use `ctx.dom.observe()` (a mutation observer), so bars appear as cards/pages render.

## Install — development (fast iteration)

1. Seanime → **Settings → Extensions**, make sure plugins are enabled.
2. Keep `"isDevelopment": true` in the manifest and set `payloadURI` to the local file,
   e.g. `file:///C:/Users/kanth/ClaudeCode/Seanime_Ep_Bar/plugin.ts`.
3. Add the extension from the manifest, reload. No permissions are requested.

## Install — from GitHub (normal use)

1. Push this repo. The manifest already points `payloadURI` at
   `https://raw.githubusercontent.com/amunds1-dev/seanime_library_ep_overview/main/plugin.ts`.
2. Remove (or set false) `"isDevelopment"` in the manifest for the published copy.
3. In Seanime, add a custom extension using the **raw URL of `episode-overview-bar.json`**.

## Typecheck

```
npx -y -p typescript@5.4 tsc --noEmit --target ES2018 --lib ES2018 --skipLibCheck --strict false plugin.ts
```

## Colors & theming

Colors live in the `COLORS` object near the top of `plugin.ts` and use Seanime's CSS
variables, so they follow the app theme automatically:

- `watched` = `var(--brand)` — follows your accent color in Seanime settings
- `track` / `aired` = `rgb(var(--color-gray-*) / a)` — adapt to light/dark
- `library` = a fixed green (semantic "in your library"); change to `var(--brand)` shades
  if you want it to track the accent too

## Diagnostics toggle

The plugin adds a **tray icon** (bar-chart). Open it to toggle **"Show diagnostic
toasts"** — off by default. When on, it shows matched/injected card counts (useful if the
bar ever stops appearing). `$debug.log` output always goes to Seanime's server logs.

## Performance

Card data is fetched once per anime and cached; injection reads attributes from the query
snapshot, renders each bar in ~2 client messages, and runs with bounded concurrency, so
bars populate quickly as cards appear.

## Known limitations

- Counts are cached per session; reload to refresh after watching/downloading.
- The "in library" count under Nakama is computed but not yet verified against a live
  host+peer setup.
