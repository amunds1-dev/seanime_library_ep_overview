/// <reference path="./types/plugin.d.ts" />
/// <reference path="./types/system.d.ts" />
/// <reference path="./types/app.d.ts" />
/// <reference path="./types/core.d.ts" />
//
// Episode Overview Bar
// --------------------
// A 3-layer progress bar + exact counts, injected onto:
//   1. Library / Home grid cards  (below the cover + title)
//   2. Anime detail page          (above the episode list)
//
// Layers (bar is conceptually divided into TOTAL equal segments):
//   - track  (theme grey)  = total episodes
//   - aired  (light fill)  = episodes aired so far
//   - library(green strip) = episodes present in the local library (slim, bottom)
//   - watched(accent fill) = episodes watched (AniList progress) — follows --brand
//
// Colors use Seanime CSS variables, so they follow the app theme automatically.
// Data comes from ctx.anime.getAnimeEntry(mediaId) (no scopes, Nakama-aware).
// A tray icon exposes a "diagnostics" toggle for the temporary debug toasts.
// Confirmed against Seanime v3.8.7 (Kanata).
//
// NOTE: Seanime stringifies this $ui.register callback and re-evaluates it in
// isolation, so everything it uses must live INSIDE this function body.

type Counts = {
    total: number
    aired: number
    library: number
    watched: number
}

function init() {
    $ui.register((ctx) => {
        // ── Settings + diagnostics toggle ────────────────────────────────────
        const settings = ctx.settings.define("config", { diagnostics: false })
        let diagnostics = !!settings.get("diagnostics")
        settings.watch((v) => {
            diagnostics = !!v.diagnostics
        })
        function diag(msg: string) {
            $debug.log("[episode-overview-bar] " + msg)
            if (diagnostics) ctx.toast.info(msg)
        }

        // Tray icon = the plugin's settings surface (holds the toggle).
        // Must be a raster URL ending in .png/.jpg/etc — Seanime's image component
        // (isExternal) rejects .svg and data: URIs and shows a fallback instead.
        const ICON = "https://raw.githubusercontent.com/amunds1-dev/seanime_library_ep_overview/main/icon.png"
        const diagRef = settings.fieldRef("diagnostics")
        const tray = ctx.newTray({ iconUrl: ICON, withContent: true, width: "320px" })
        tray.render(() =>
            tray.stack([
                tray.text("Episode Overview Bar"),
                tray.text("Diagnostic toasts report matched/injected card counts. Leave off for normal use."),
                tray.switch("Show diagnostic toasts", { fieldRef: diagRef }),
            ]),
        )

        diag("Episode Overview Bar v0.2.3 active")

        // ── Theme-aware colors (resolve against Seanime's CSS variables) ──────
        // To restyle, edit these. var(--brand) follows the user's accent color;
        // rgb(var(--color-*-NNN) / a) uses Seanime's palette with custom opacity.
        const COLORS = {
            track: "rgb(var(--color-gray-500) / 0.22)", // total backdrop
            aired: "rgb(var(--color-gray-200) / 0.32)", // aired fill
            watched: "rgb(var(--color-brand-300))", // watched — light purple (accent)
            library: "rgb(var(--color-brand-300))", // in-library — light purple (accent)
            segment: "rgb(var(--color-gray-950) / 0.40)", // segment dividers
        }

        // ── Selectors (confirmed from v3.8.7 frontend source) ────────────────
        const CARD_SELECTOR = "[data-media-entry-card-container]"
        const CARD_TITLE_SELECTOR = "[data-media-entry-card-title-section]"
        const DETAIL_EPISODE_LIST_SELECTOR = "[data-anime-entry-page-episode-list-view]"
        const DETAIL_PAGE_WRAPPER_SELECTOR = "[data-anime-entry-page]"

        // ── Data layer ───────────────────────────────────────────────────────
        const cache: Record<number, Counts | null> = {}

        function computeCounts(entry: $app.Anime_Entry): Counts {
            const media = entry.media
            const total = media?.episodes ?? 0

            let aired = total
            if (media?.nextAiringEpisode?.episode) {
                aired = Math.max(0, media.nextAiringEpisode.episode - 1)
            }
            if (total > 0) aired = Math.min(aired, total)

            const watched = entry.listData?.progress ?? 0

            // In library: mainFileCount = main episode files held locally. Under
            // Nakama, the local count may be 0 while nakamaLibraryData reports the
            // host's shared episodes, so take whichever is larger.
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

        // ── Rendering ────────────────────────────────────────────────────────
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
                `background:${COLORS.watched};opacity:.9"></div>` +
                `<div style="position:absolute;left:0;bottom:0;height:3px;width:${pct(c.library, denom)}%;` +
                `background:${COLORS.library}"></div>` +
                segs +
                `</div>` +
                `<div style="font-size:${fs}px;line-height:1.35;opacity:.85;margin-top:3px">` +
                `${c.total || "?"} total · ${c.aired} aired · ${c.library} in library · ${c.watched} watched` +
                `</div>`
            )
        }

        // One createElement + one setInnerHTML (the styled wrapper + marker live
        // inside the HTML), so each bar costs only ~2 client messages.
        async function makeBox(c: Counts, big: boolean, padding: string): Promise<$ui.DOMElement> {
            const box = await ctx.dom.createElement("div")
            box.setInnerHTML(
                `<div data-epov-bar="1" style="width:100%;padding:${padding};box-sizing:border-box">` +
                    renderBarHTML(c, big) +
                    `</div>`,
            )
            return box
        }

        // Read an attribute from the query snapshot if present (no round-trip),
        // else fetch it live.
        async function readAttr(el: $ui.DOMElement, name: string): Promise<string | null> {
            const a = el.attributes
            if (a && Object.prototype.hasOwnProperty.call(a, name)) return a[name]
            return await el.getAttribute(name)
        }

        // Run async work over items with bounded concurrency; resolves with the
        // count of truthy results.
        function mapLimit(
            items: $ui.DOMElement[],
            limit: number,
            fn: (item: $ui.DOMElement) => Promise<boolean>,
        ): Promise<number> {
            return new Promise((resolve) => {
                if (items.length === 0) {
                    resolve(0)
                    return
                }
                let i = 0
                let active = 0
                let done = 0
                let count = 0
                function launch() {
                    while (active < limit && i < items.length) {
                        const item = items[i++]
                        active++
                        fn(item)
                            .then((r) => {
                                if (r) count++
                            })
                            .catch(() => {})
                            .then(() => {
                                active--
                                done++
                                if (done === items.length) resolve(count)
                                else launch()
                            })
                    }
                }
                launch()
            })
        }

        // ── Serialized runner (debounce + no-overlap) ────────────────────────
        // Three near-simultaneous passes (observe + navigate + startup) could each
        // read "no bar yet" before any of them wrote, producing duplicate bars.
        // A debounced single-runner collapses bursts and guarantees reconciles
        // never overlap; a trailing run handles items that mounted mid-reconcile.
        function makeRunner(key: string, fn: () => Promise<void>): () => void {
            let running = false
            let rerun = false
            async function run() {
                if (running) {
                    rerun = true
                    return
                }
                running = true
                try {
                    await fn()
                } catch (e) {
                    $debug.error("[episode-overview-bar] runner " + key, e)
                } finally {
                    running = false
                    if (rerun) {
                        rerun = false
                        void run()
                    }
                }
            }
            return () => ctx.jobs.debounce("epov-" + key, () => void run(), 120)
        }

        // ── 1. Library / Home grid ───────────────────────────────────────────
        // Dedup is an in-DOM existence check ("does this card already have a
        // bar?") — authoritative, and self-heals if Seanime re-renders a card.
        async function injectCard(card: $ui.DOMElement): Promise<boolean> {
            const type = await readAttr(card, "data-media-type")
            if (type && type !== "anime") return false
            if (await card.queryOne("[data-epov-bar]")) return false // already has one
            const idStr = await readAttr(card, "data-media-id")
            const id = idStr ? parseInt(idStr, 10) : NaN
            if (!id || isNaN(id)) return false
            const c = await getCounts(id)
            if (!c) return false
            const box = await makeBox(c, false, "4px 2px 2px")
            const title = await card.queryOne(CARD_TITLE_SELECTOR)
            if (title) title.append(box)
            else card.append(box)
            return true
        }

        let lastReport = ""
        const scheduleGrid = makeRunner("grid", async () => {
            let cards: $ui.DOMElement[] = []
            try {
                cards = await ctx.dom.query(CARD_SELECTOR)
            } catch (e) {
                $debug.error("[episode-overview-bar] grid query failed", e)
                return
            }
            const injected = await mapLimit(cards, 6, (card) =>
                injectCard(card).catch((e) => {
                    $debug.error("[episode-overview-bar] grid inject error", e)
                    return false
                }),
            )
            const report = "matched " + cards.length + " injected " + injected
            if (report !== lastReport) {
                lastReport = report
                diag("EpOverview grid " + report)
            }
        })

        // ── 2. Detail page ───────────────────────────────────────────────────
        // Uses a distinct marker (data-epov-detail-bar) so it isn't confused with
        // the recommendation cards' bars that also live inside the page wrapper.
        const scheduleDetail = makeRunner("detail", async () => {
            const view = await ctx.dom.queryOne(DETAIL_EPISODE_LIST_SELECTOR)
            if (!view) return
            const wrapper = await ctx.dom.queryOne(DETAIL_PAGE_WRAPPER_SELECTOR)
            if (!wrapper) return
            if (await wrapper.queryOne("[data-epov-detail-bar]")) return // already
            let id = 0
            try {
                const mediaJson = await wrapper.getAttribute("data-media")
                if (mediaJson) id = JSON.parse(mediaJson).id
            } catch (e) {
                $debug.error("[episode-overview-bar] could not parse detail media id", e)
            }
            if (!id) return
            const c = await getCounts(id)
            if (!c) return
            const box = await makeBox(c, true, "8px 0 6px")
            box.setAttribute("data-epov-detail-bar", "1")
            view.before(box)
        })

        // Triggers: observe (dynamic mounts) + navigation + startup.
        ctx.dom.observe(CARD_SELECTOR, () => scheduleGrid())
        ctx.dom.observe(DETAIL_EPISODE_LIST_SELECTOR, () => scheduleDetail())
        ctx.screen.onNavigate(() => {
            scheduleGrid()
            scheduleDetail()
        })
        scheduleGrid()
        scheduleDetail()
    })
}
