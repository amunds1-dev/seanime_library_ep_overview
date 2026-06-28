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

## Known limitations (v0.1)

- Counts are cached per session; reload to refresh after watching/downloading.
- The "in library" count under Nakama is computed but not yet verified against a live
  host+peer setup — the main thing to confirm on first run.
