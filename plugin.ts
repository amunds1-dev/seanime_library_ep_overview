/// <reference path="./plugin.d.ts" />
//
// Episode Overview Bar
// --------------------
// Injects a 3-layer progress bar + exact counts onto:
//   1. Library grid cards  (priority 1)
//   2. Anime detail page   (priority 2)
//
// Each bar is divided conceptually into TOTAL equal segments and shows:
//   - track (grey)            = total episodes
//   - aired fill (dark grey)  = episodes that have aired so far
//   - library bar (dark grpn) = episodes present in the local library  (slim, bottom strip)
//   - watched fill (lt green) = episodes watched (AniList progress)
//
// ─────────────────────────────────────────────────────────────────────────────
// THINGS TO VERIFY AGAINST YOUR SEANIME VERSION (search for "VERIFY:")
//   1. CARD_SELECTOR / how a card links to /entry?id=<mediaId>
//   2. The container element on the detail page to append the bar to
//   3. How the local-library episode count is obtained (getEpisodeCollection)
// ─────────────────────────────────────────────────────────────────────────────

// Confirmed against Seanime v3.8.7 (Kanata): each library card is a
//   <div data-media-entry-card-container data-media-id="NN" data-media-type="anime" ...>
// We append our bar to that container, after its title section.
const CARD_SELECTOR = '[data-media-entry-card-container][data-media-type="anime"]'

// Visual config
const COLORS = {
    track: "rgba(255,255,255,0.12)", // grey backdrop / total
    aired: "rgba(255,255,255,0.35)", // dark-ish fill for aired
    library: "#1f7a3d", // dark green slim bar
    watched: "#4ade80", // light green watched fill
    segment: "rgba(0,0,0,0.35)", // segment divider lines
}

type Counts = {
    total: number
    aired: number
    library: number
    watched: number
}

function init() {
    $ui.register(async (ctx) => {
        // ── Data layer ───────────────────────────────────────────────────────
        // Pulled once; refreshed cheaply because getAnimeCollection is cached.
        const counts = new Map<number, Counts>()
        const libraryCache = new Map<number, number>() // mediaId -> downloaded count

        async function loadCollection() {
            try {
                const collection = await $anilist.getAnimeCollection(false)
                const lists = collection?.MediaListCollection?.lists ?? []
                for (const list of lists) {
                    for (const entry of list?.entries ?? []) {
                        const media = entry?.media
                        if (!media?.id) continue
                        const total = media.episodes ?? 0
                        // aired = next airing episode - 1, else total when finished/no schedule
                        const aired = media.nextAiringEpisode?.episode
                            ? Math.max(0, media.nextAiringEpisode.episode - 1)
                            : total
                        counts.set(media.id, {
                            total,
                            aired,
                            library: 0, // filled lazily per visible card
                            watched: entry.progress ?? 0,
                        })
                    }
                }
            } catch (e) {
                console.error("[episode-overview-bar] failed to load collection", e)
            }
        }

        // VERIFY: confirm this returns the locally-available episodes for an entry.
        // getEpisodeCollection returns the normalized episode collection; its
        // length is the number of episodes present in the local library.
        async function getLibraryCount(mediaId: number): Promise<number> {
            if (libraryCache.has(mediaId)) return libraryCache.get(mediaId)!
            let n = 0
            try {
                const ec = await $anime.getEpisodeCollection(mediaId)
                n = ec?.episodes?.length ?? 0
            } catch (e) {
                console.error("[episode-overview-bar] episode collection failed", mediaId, e)
            }
            libraryCache.set(mediaId, n)
            return n
        }

        await loadCollection()

        // ── Rendering ────────────────────────────────────────────────────────
        function pct(part: number, total: number): string {
            if (!total || total <= 0) return "0%"
            return Math.min(100, Math.max(0, (part / total) * 100)) + "%"
        }

        async function buildBar(c: Counts) {
            const wrap = await ctx.dom.createElement("div")
            wrap.setStyle("position", "relative")
            wrap.setStyle("width", "100%")
            wrap.setStyle("height", "10px")
            wrap.setStyle("margin-top", "4px")
            wrap.setStyle("border-radius", "4px")
            wrap.setStyle("overflow", "hidden")
            wrap.setStyle("background", COLORS.track)

            // aired fill
            const aired = await ctx.dom.createElement("div")
            aired.setStyle("position", "absolute")
            aired.setStyle("left", "0")
            aired.setStyle("top", "0")
            aired.setStyle("bottom", "0")
            aired.setStyle("width", pct(c.aired, c.total))
            aired.setStyle("background", COLORS.aired)
            wrap.append(aired)

            // watched fill
            const watched = await ctx.dom.createElement("div")
            watched.setStyle("position", "absolute")
            watched.setStyle("left", "0")
            watched.setStyle("top", "0")
            watched.setStyle("bottom", "0")
            watched.setStyle("width", pct(c.watched, c.total))
            watched.setStyle("background", COLORS.watched)
            watched.setStyle("opacity", "0.85")
            wrap.append(watched)

            // library slim bar (bottom strip)
            const library = await ctx.dom.createElement("div")
            library.setStyle("position", "absolute")
            library.setStyle("left", "0")
            library.setStyle("bottom", "0")
            library.setStyle("height", "3px")
            library.setStyle("width", pct(c.library, c.total))
            library.setStyle("background", COLORS.library)
            wrap.append(library)

            // segment dividers (total split into equal parts)
            if (c.total > 0 && c.total <= 100) {
                const seg = await ctx.dom.createElement("div")
                seg.setStyle("position", "absolute")
                seg.setStyle("inset", "0")
                seg.setStyle("pointer-events", "none")
                const step = 100 / c.total
                seg.setStyle(
                    "background",
                    `repeating-linear-gradient(to right, transparent 0, transparent calc(${step}% - 1px), ${COLORS.segment} calc(${step}% - 1px), ${COLORS.segment} ${step}%)`,
                )
                wrap.append(seg)
            }
            return wrap
        }

        async function buildLabel(c: Counts) {
            const label = await ctx.dom.createElement("div")
            label.setStyle("font-size", "11px")
            label.setStyle("line-height", "1.3")
            label.setStyle("opacity", "0.85")
            label.setStyle("margin-top", "2px")
            label.setText(
                `${c.total} total · ${c.aired} aired · ${c.library} in library · ${c.watched} watched`,
            )
            return label
        }

        async function injectInto(card: $ui.DOMElement) {
            // avoid double-injection
            const done = await card.getAttribute("data-epov")
            if (done === "1") return
            const idStr = await card.getAttribute("data-media-id")
            const id = idStr ? parseInt(idStr, 10) : NaN
            if (!id || isNaN(id)) return
            const base = counts.get(id)
            if (!base) return

            card.setAttribute("data-epov", "1")
            const lib = await getLibraryCount(id)
            const c: Counts = { ...base, library: lib }

            const container = await ctx.dom.createElement("div")
            container.setStyle("width", "100%")
            container.setStyle("padding", "2px 0")
            container.append(await buildBar(c))
            container.append(await buildLabel(c))
            // appended after the title section, inside the card container
            card.append(container)
        }

        // ── Library grid: observe cards as they render ───────────────────────
        const [stopObserving] = ctx.dom.observe(CARD_SELECTOR, async (cards) => {
            for (const card of cards) {
                await injectInto(card)
            }
        })

        // ── Detail page hook (priority 2): refetch when navigating to /entry ─
        ctx.screen.onNavigate(async (e) => {
            if (e.pathname !== "/entry") return
            // VERIFY: pick the real container on the detail page to append into.
            // Placeholder selector — confirm against your build.
            // const header = await ctx.dom.queryOne(".anime-entry-header")
            // if (header) { ... build + append a larger bar ... }
        })

        // cleanup is automatic on unload, but keep handle available
        void stopObserving
    })
}
