/// <reference path="./types/plugin.d.ts" />
/// <reference path="./types/system.d.ts" />
/// <reference path="./types/app.d.ts" />
/// <reference path="./types/core.d.ts" />
//
// Episode Overview Bar
// --------------------
// A 3-layer progress bar + exact counts, injected onto:
//   1. Library grid cards  (div[data-media-entry-card-container][data-media-id])
//   2. Anime detail page    (before [data-anime-entry-page-episode-list-view])
//
// Layers (bar is conceptually divided into TOTAL equal segments):
//   - track  (grey)        = total episodes
//   - aired  (light fill)  = episodes aired so far
//   - library(green strip) = episodes present in the local library (slim, bottom)
//   - watched(green fill)  = episodes watched (AniList progress)
//
// All data comes from ctx.anime.getAnimeEntry(mediaId) -> $app.Anime_Entry,
// which requires NO permission scope and is Nakama-aware (see getLibraryCount).
// Confirmed against Seanime v3.8.7 (Kanata).

type Counts = {
    total: number
    aired: number
    library: number
    watched: number
}

function init() {
    $ui.register((ctx) => {
        // IMPORTANT: Seanime stringifies this callback and re-evaluates it, so it
        // cannot see module-level declarations. Everything it uses must live INSIDE
        // this function body. (That's why the constants below are defined here.)

        // ── Selectors (confirmed from v3.8.7 frontend source) ────────────────
        const CARD_SELECTOR = "[data-media-entry-card-container]"
        const CARD_TITLE_SELECTOR = "[data-media-entry-card-title-section]"
        const DETAIL_EPISODE_LIST_SELECTOR = "[data-anime-entry-page-episode-list-view]"
        const DETAIL_PAGE_WRAPPER_SELECTOR = "[data-anime-entry-page]"

        // ── Colors ───────────────────────────────────────────────────────────
        const COLORS = {
            track: "rgba(255,255,255,0.12)", // grey backdrop = total
            aired: "rgba(255,255,255,0.34)", // aired fill
            library: "#1f7a3d", // dark green slim bar = in library
            watched: "#4ade80", // light green fill = watched
            segment: "rgba(0,0,0,0.40)", // segment dividers
        }

        // Per-media cache so scrolling / re-renders don't refetch.
        // NOTE: counts are cached for the session; reload to refresh after watching.
        const cache: Record<number, Counts | null> = {}

        // TEMP diagnostics (remove once the card bar is confirmed working).
        ctx.toast.info("Episode Overview Bar v0.1.4 active")

        function computeCounts(entry: $app.Anime_Entry): Counts {
            const media = entry.media
            const total = media?.episodes ?? 0

            // Aired = (next airing episode - 1); if no schedule, assume all aired.
            let aired = total
            if (media?.nextAiringEpisode?.episode) {
                aired = Math.max(0, media.nextAiringEpisode.episode - 1)
            }
            if (total > 0) aired = Math.min(aired, total)

            const watched = entry.listData?.progress ?? 0

            // In library: mainFileCount = number of main episode files held locally.
            // Under Nakama (browsing a shared host library on this client), the local
            // count is 0 but nakamaLibraryData reports the host's available episodes,
            // so we take whichever is larger to reflect what's actually reachable.
            let library = entry.libraryData?.mainFileCount ?? 0
            if (entry._isNakamaEntry) {
                const nakama = entry.nakamaLibraryData?.mainFileCount ?? 0
                library = Math.max(library, nakama)
            }

            return { total, aired, library, watched }
        }

        async function getCounts(mediaId: number): Promise<Counts | null> {
            if (mediaId in cache) return cache[mediaId]
            try {
                const entry = await ctx.anime.getAnimeEntry(mediaId)
                const c = computeCounts(entry)
                cache[mediaId] = c
                return c
            } catch (e) {
                $debug.error("[episode-overview-bar] getAnimeEntry failed", mediaId, e)
                cache[mediaId] = null
                return null
            }
        }

        // ── Rendering (single setInnerHTML per bar) ──────────────────────────
        function pct(part: number, denom: number): number {
            if (denom <= 0) return 0
            const p = (part / denom) * 100
            return Math.max(0, Math.min(100, Math.round(p * 10) / 10))
        }

        function renderBarHTML(c: Counts, big: boolean): string {
            const denom = c.total > 0 ? c.total : Math.max(c.aired, c.library, c.watched, 1)
            const h = big ? 14 : 10
            const fs = big ? 12 : 11

            let segs = ""
            if (c.total > 1 && c.total <= 100) {
                const step = 100 / c.total
                segs =
                    `<div style="position:absolute;inset:0;pointer-events:none;` +
                    `background:repeating-linear-gradient(to right,transparent 0,` +
                    `transparent calc(${step}% - 1px),${COLORS.segment} calc(${step}% - 1px),` +
                    `${COLORS.segment} ${step}%)"></div>`
            }

            return (
                `<div style="position:relative;width:100%;height:${h}px;border-radius:4px;` +
                `overflow:hidden;background:${COLORS.track}">` +
                `<div style="position:absolute;left:0;top:0;bottom:0;width:${pct(c.aired, denom)}%;` +
                `background:${COLORS.aired}"></div>` +
                `<div style="position:absolute;left:0;top:0;bottom:0;width:${pct(c.watched, denom)}%;` +
                `background:${COLORS.watched};opacity:.85"></div>` +
                `<div style="position:absolute;left:0;bottom:0;height:3px;width:${pct(c.library, denom)}%;` +
                `background:${COLORS.library}"></div>` +
                segs +
                `</div>` +
                `<div style="font-size:${fs}px;line-height:1.35;opacity:.85;margin-top:3px">` +
                `${c.total || "?"} total · ${c.aired} aired · ${c.library} in library · ${c.watched} watched` +
                `</div>`
            )
        }

        async function makeBox(c: Counts, big: boolean, padding: string): Promise<$ui.DOMElement> {
            const box = await ctx.dom.createElement("div")
            box.setStyle("width", "100%")
            box.setStyle("padding", padding)
            box.setStyle("box-sizing", "border-box")
            box.setInnerHTML(renderBarHTML(c, big))
            return box
        }

        // ── 1. Library grid ──────────────────────────────────────────────────
        // Injected boxes carry data-epov-bar="1" so they're findable in DevTools
        // Elements (Ctrl+F "epov-bar").
        async function injectCard(card: $ui.DOMElement): Promise<boolean> {
            // NOTE: use getAttribute("data-…") not getDataAttribute("media-id");
            // the dataset-style helper needs camelCase for hyphenated keys, so
            // getDataAttribute("media-id") returns null (cause of matched>0, injected 0).
            if (await card.getAttribute("data-epov")) return false
            const type = await card.getAttribute("data-media-type")
            if (type && type !== "anime") {
                card.setAttribute("data-epov", "skip") // manga etc.
                return false
            }
            const idStr = await card.getAttribute("data-media-id")
            const id = idStr ? parseInt(idStr, 10) : NaN
            if (!id || isNaN(id)) return false
            card.setAttribute("data-epov", "1") // mark before await to avoid races
            const c = await getCounts(id)
            if (!c) return false
            const box = await makeBox(c, false, "4px 2px 2px")
            box.setAttribute("data-epov-bar", "1")
            // Prefer the title section so the bar flows below the cover + title.
            const title = await card.queryOne(CARD_TITLE_SELECTOR)
            if (title) title.append(box)
            else card.append(box)
            return true
        }

        let lastGridReport = ""
        async function reportGrid(source: string, matched: number, injected: number) {
            const report = source + ": matched " + matched + " injected " + injected
            $debug.log("[episode-overview-bar] grid " + report)
            if (report !== lastGridReport) {
                lastGridReport = report
                ctx.toast.info("EpOverview grid " + report)
            }
        }

        async function sweepGrid(source: string) {
            let cards: $ui.DOMElement[] = []
            try {
                cards = await ctx.dom.query(CARD_SELECTOR)
            } catch (e) {
                $debug.error("[episode-overview-bar] grid query failed", e)
                return
            }
            let injected = 0
            for (const card of cards) {
                try {
                    if (await injectCard(card)) injected++
                } catch (e) {
                    $debug.error("[episode-overview-bar] grid inject error", e)
                }
            }
            await reportGrid(source, cards.length, injected)
        }

        // observe handles cards added later (scrolling a carousel, route changes)
        ctx.dom.observe(CARD_SELECTOR, async (cards) => {
            let injected = 0
            for (const card of cards) {
                try {
                    if (await injectCard(card)) injected++
                } catch (e) {
                    $debug.error("[episode-overview-bar] grid inject error", e)
                }
            }
            await reportGrid("observe", cards.length, injected)
        })

        // Active sweeps cover cards already present when a route mounts, which
        // observe may not re-report on client-side navigation.
        ctx.screen.onNavigate(() => {
            void sweepGrid("nav")
        })
        void sweepGrid("startup")

        // ── 2. Detail page ───────────────────────────────────────────────────
        // Inject above the episode list. Media id is read from the page wrapper's
        // serialized media JSON (data-media), so it works regardless of route timing.
        ctx.dom.observe(DETAIL_EPISODE_LIST_SELECTOR, async (views) => {
            for (const view of views) {
                if (await view.getAttribute("data-epov-detail")) continue
                const wrapper = await ctx.dom.queryOne(DETAIL_PAGE_WRAPPER_SELECTOR)
                if (!wrapper) continue
                let id = 0
                try {
                    const mediaJson = await wrapper.getAttribute("data-media")
                    if (mediaJson) id = JSON.parse(mediaJson).id
                } catch (e) {
                    $debug.error("[episode-overview-bar] could not parse detail media id", e)
                }
                if (!id) continue
                view.setAttribute("data-epov-detail", "1")
                const c = await getCounts(id)
                if (!c) continue
                view.before(await makeBox(c, true, "8px 0 6px"))
            }
        })
    })
}
