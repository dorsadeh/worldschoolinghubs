# UI upgrade: "Quiet Atlas" — design spec

**Date:** 2026-06-11
**Status:** Approved
**Goal:** Replace the playful neo-brutalist look (thick borders, hard offset shadows, emojis, Baloo 2) with a calm, trustworthy product aesthetic — minimal, data-forward, one deep accent — while keeping the existing page structure, data model, and filtering logic.

Validated via browser mockups (session `.superpowers/brainstorm/3426368-1781183986/content/full-page-v2.html`): visual direction "A — Quiet Atlas" chosen over "Warm Cartography" and "Travel Platform"; full-page desktop + mobile mockups approved with three amendments (warmer Voyager map tiles, 2-up card grid, mobile design).

## 1. Visual system (design tokens)

All tokens live in `app/globals.css` as CSS variables under `@theme` / `:root` so Tailwind utilities can use them. Components stop hardcoding hex values (`#20140d`, `#fff4e6`, `#caffbf`, …) and inline `fontFamily` styles.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#18181b` | primary text |
| `--muted` | `#71717a` | secondary text |
| `--faint` | `#a1a1aa` | tertiary text, labels |
| `--line` | `#e4e4e7` | hairline borders |
| `--bg` | `#fafafa` | page background |
| `--surface` | `#ffffff` | cards, header, bars |
| `--accent` | `#0e7a5f` | brand accent (logo, active states, season pill) |
| `--accent-soft` | `#e7f5f0` | accent tint backgrounds |

Category palette (replaces `CATEGORY_META` colors in `lib/directory.ts`):
organic `#16a34a`, commercial `#7c3aed`, community `#0d9488`, popup `#e11d48`, traveling `#2563eb`, spanish `#d97706`. Category color appears only as small dots (chips, badges, legend) and map pins — never as large fills or white-on-color sticker badges.

**Typography:** Geist Sans (already loaded) for everything. Remove Baloo 2 and Hanken Grotesk from `app/layout.tsx`. Hierarchy via weight/size: titles 700 with `-0.01em` tracking, body 400–500, micro-labels 11px/600/uppercase/`0.06em` tracking.

**Shape & depth:** radius 7–12px (chips 7, cards 12, modal 16); 1px borders in `--line`; shadows only soft ambient (`0 4px 16px rgba(0,0,0,.08)` on card hover, `0 2px 10px rgba(0,0,0,.07)` on floating map controls). No offset "sticker" shadows, no element rotation, **no emojis anywhere in UI chrome** (hub content text may still contain them).

## 2. Layout & components (desktop)

Page structure is unchanged: header → filter bar → tabs → card grid + map split → footer.

- **Header (replaces top row of FilterBar):** 56px, white, hairline bottom border. Left: logo mark (26px rounded square, accent bg, white globe SVG) + "Worldschool Atlas" wordmark (15.5px/800). Center-left: search input (~340px, `--bg` fill, hairline border, search icon). Right: "**161** hubs" count (count bold ink, word muted) and a bordered "Contact" button (replaces footer-only contact entry point; footer link stays too).
- **Filter bar (`FilterBar.tsx`):** single wrapping row on white. Groups labeled with micro-labels: **When** (two month selects styled as chips, "→" between), **Cost**, **Type**, participation. Vertical hairline dividers between groups. Chips: white, hairline border, 12.5px/600; selected state = solid ink background, white text (cost/participation) or chip keeps its dot (type). Type chips contain a 7px category-color dot. "Reset filters" right-aligned, text-only, muted; rendered only when at least one filter is active. Keep existing `data-tip` tooltips, restyled to match (ink bubble, 8px radius).
- **Tabs (`DirectoryExplorer.tsx` TabBar):** underline tabs — 13px/600, muted; active = ink text + 2px ink underline. Count pill: hairline-bordered neutral; active tab's count pill uses `--accent-soft` + accent text. No emojis.
- **Card grid:** `grid-cols-1 sm:grid-cols-2` in the list pane (2-up at desktop, ~4 cards visible), 16px gap.
- **HubCard:** white, hairline border, radius 12, hover = soft shadow + `-translate-y-[2px]`. Image area 168px. Top-left badge: white 94%-opacity rounded chip with category dot + label (replaces rotated colored sticker). Top-right: participation badge as white chip with text "Family"/"Drop-off" (replaces emoji circle). Body: title 15.5px/700, location 12.5px muted, then season pill (accent-soft/accent) + cost pill (zinc-100/zinc-600). Cost labels become words: "Free", "$ budget", "$$ mid", "$$$ premium", "Price unlisted" (`COST_META` display only — filter values unchanged).
- **Designed placeholder (replaces `FallbackImage`):** soft two-stop gradient tinted from the hub's category color (very desaturated, e.g. mix toward `#eef4f1`), centered pin icon (SVG, 24px, 55% opacity) + location name in 11.5px uppercase (65% opacity). Used when a hub has no image, the image fails to load, or the image is blocklisted (§4).
- **HubModal:** same content and sections, restyled — white surface, radius 16, soft large shadow (no offset border-shadow), hairline `--line` section dividers, neutral Tag chips, section titles as micro-labels without emojis, links as accent-colored bordered buttons, close button as quiet circular hairline button. "Flag an error" stays, quiet muted-underline style.
- **Footer:** white, hairline top border, 11.5px faint text; same disclaimer + Contact link.
- **Empty states:** centered muted text; "view anywhere hubs" action becomes a quiet bordered chip-button.

## 3. Card ordering: images first

Within the current filtered + in-bounds result set, hubs with a *usable* image (exists and not blocklisted) sort before hubs that will render the placeholder. Within each group, preserve the existing order. Applies to the map-tab grid and the Anywhere grid. Implemented as a pure helper in `lib/directory.ts` (e.g. `sortByImagePresence(hubs)`) with unit tests.

## 4. Image curation pipeline

- A **blocklist** of junk images (flags, logos, favicons, icons, low-res graphics) ships as data — e.g. `data/image-blocklist.json`, an array of hub ids whose current image must be ignored. Initial contents come from the image audit (`docs/image-audit.md`, produced by the background audit agent which is also collecting replacement-image candidates with sources/licenses).
- `lib/directory.ts` exposes `hubImage(hub): string | null` returning `null` for missing/blocklisted images; HubCard/HubModal/sorting all use it. The existing `onError` runtime fallback stays as a safety net.
- Replacing junk images with the audit's candidate URLs is a **separate follow-up workstream** (requires human approval of candidates/licenses) — out of scope for this implementation, but the blocklist + placeholder make the site presentable regardless.

## 5. Map (`DirectoryMap.tsx`; apply the same tiles/pins/clusters to the legacy `/map` route's `HubMap.tsx`, but no other work on that page)

- **Tiles:** CARTO Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`) with proper attribution ("© OpenStreetMap contributors © CARTO"). Replaces default OSM tiles.
- **Pins:** custom teardrop SVG divIcons — 22px drop in category color, 2px white stroke, small white center hole, subtle drop shadow. Keep hover/selected pop animation (existing `.ws-pin-pop`), reduced overshoot.
- **Clusters:** neutral ink circles, white 2px ring, white 11px/700 count (replaces yellow-green bubbles).
- **Legend:** white 96%-opacity card, hairline border, radius 10, "HUB TYPE" micro-label, rows of 8px color dot + label. No emojis. Remove "Online community"/"Junk" rows (already hidden categories).
- **Zoom control:** restyled white hairline buttons to match.
- Loading state: neutral `--bg` with muted "Loading map…".

## 6. Mobile (new — currently the map is hidden on `< md`)

- **List view (default):** compact header (logo + count, search full-width below), filter chips in one horizontally scrolling row with right-edge fade; first chip is a dark "Filters · N" button opening a **bottom-sheet** containing the full grouped filter set (same state, same `DirectoryFilter` object). Cards single-column. Floating centered "Map" pill button (ink bg, white text) at the bottom.
- **Map view:** full-screen map under the compact header; floating "List" toggle. Tapping a pin opens a **bottom-sheet preview** (thumbnail 84×64, title, location, season/cost pills); tapping the preview opens the full HubModal. Tabs ("On the map"/"Anywhere") remain above the list in list view.
- Implementation detail: mobile view toggle is component state in `DirectoryExplorer` (like the existing `view` state); the map mounts on mobile only when toggled (keeps initial load light).

## 7. Out of scope

No new pages or routes; no data-model/schema changes (blocklist is additive data); no changes to filter logic, build pipeline (`scripts/`), or feedback/Formspree flow (FeedbackModal gets the same restyle pass only); no dark mode; no replacement-image downloads (follow-up workstream).

## 8. Testing & verification

- Unit tests (vitest): `sortByImagePresence`, `hubImage` (missing / blocklisted / present).
- Existing tests must stay green (`npm test`); lint clean.
- Visual verification with the run skill: desktop explorer (filters, tabs, card hover, modal, map pins/clusters/legend), mobile viewport (filter sheet, map toggle, pin bottom-sheet), and the placeholder rendering for a blocklisted hub.
