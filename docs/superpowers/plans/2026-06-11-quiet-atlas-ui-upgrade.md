# Quiet Atlas UI Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **MODEL REQUIREMENT (user-mandated):** This plan must be executed by a **cheaper model than Fable 5** — run the executing session with `claude --model sonnet`, or if using subagent-driven-development, dispatch every implementation subagent with `model: "sonnet"`. The plan is written to require no design judgment: all code is provided.

**Goal:** Replace the playful neo-brutalist UI with the approved "Quiet Atlas" visual system (calm, minimal, trustworthy), add image-first card sorting with a junk-image blocklist + designed placeholder, switch the map to CARTO Voyager with custom pins, and make mobile a first-class experience.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-upgrade-quiet-atlas-design.md` — read it first.

**Architecture:** Design tokens land in `app/globals.css` (Tailwind v4 `@theme`, generating `text-ink` / `bg-surface` / `border-line` etc. utilities). Pure helpers (`hubImage`, `sortByImagePresence`, `countActiveFilters`) go in `lib/directory.ts` with vitest TDD. Each component is then rewritten in place. Mobile adds two small components (`FilterSheet`, preview sheet) and a `matchMedia` hook — no routing or data-model changes.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Leaflet + leaflet.markercluster (vanilla, not react-leaflet, in the components we touch), vitest.

**Important project notes:**
- `AGENTS.md` warns this Next.js version differs from training data. We only touch `next/font` and plain components; if you need any other Next API, read `node_modules/next/dist/docs/` first.
- `.gitignore` has uncommitted changes that are NOT yours — never `git add` it; stage files explicitly by path.
- There are no component tests (no React Testing Library) — components are verified by `npm run lint`, `npm run build`, and the final visual check. TDD applies to the `lib/` helpers.
- Intermediate tasks leave the app visually mixed (old + new styles co-existing). That's expected; every commit must still compile, lint, and pass tests.
- Emojis are being removed from UI chrome. Hub *content* strings may still contain emojis — leave data alone.

---

### Task 1: Design tokens + fonts

**Files:**
- Modify: `app/globals.css` (full rewrite below)
- Modify: `app/layout.tsx`

- [ ] **Step 1: Rewrite `app/globals.css`** with this exact content:

```css
@import "tailwindcss";

@theme {
  /* Quiet Atlas tokens — the only place colors are defined. */
  --color-ink: #18181b;
  --color-muted: #71717a;
  --color-faint: #a1a1aa;
  --color-line: #e4e4e7;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-accent: #0e7a5f;
  --color-accent-soft: #e7f5f0;
  /* Category palette — small dots and map pins only, never large fills. */
  --color-cat-organic: #16a34a;
  --color-cat-commercial: #7c3aed;
  --color-cat-community: #0d9488;
  --color-cat-popup: #e11d48;
  --color-cat-traveling: #2563eb;
  --color-cat-spanish: #d97706;

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

/* Leaflet divIcon reset so our SVG pins render without the default white box. */
.ws-pin {
  background: none;
  border: none;
}

/* A pin lit up by hovering its card in the list — a quick pop.
 * The animation lives on an inner wrapper, NOT the marker root: Leaflet
 * positions the root with an inline `transform: translate3d(...)`, and a CSS
 * transform animation there would override it and fling the pin to 0,0. */
.ws-pin-inner {
  transform-origin: center bottom;
}
.ws-pin-pop {
  animation: ws-pin-pop 0.22s cubic-bezier(0.34, 1.3, 0.64, 1);
}
@keyframes ws-pin-pop {
  0% { transform: scale(0.75); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

/* Marker-cluster bubble: neutral ink circle with a white ring. */
.ws-cluster {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-ink);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

/* Filter-pill tooltips: dark bubble below on hover. */
[data-tip] { position: relative; }
[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-ink);
  color: #fff;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  width: max-content;
  max-width: 220px;
  white-space: normal;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s 0.3s;
  z-index: 9999;
  line-height: 1.45;
}
[data-tip]:hover::after { opacity: 1; }

/* Keep map panes/controls below overlays (modal z-[2000], sheets z-[1500]+). */
.leaflet-pane,
.leaflet-top,
.leaflet-bottom {
  z-index: 400;
}

.leaflet-container {
  font-family: inherit;
}

/* Quiet zoom control. */
.leaflet-touch .leaflet-bar,
.leaflet-bar {
  border: 1px solid var(--color-line);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.leaflet-touch .leaflet-bar a,
.leaflet-bar a {
  background: #fff;
  color: var(--color-ink);
  border-bottom: 1px solid var(--color-line);
}
```

Notes on what changed: removed the `prefers-color-scheme: dark` block (no dark mode in scope), removed `--font-display`/`--font-body` references, Arial body font, and the old `:root` background/foreground pair.

- [ ] **Step 2: Update `app/layout.tsx`** — remove Baloo 2 and Hanken Grotesk. Replace the whole file with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "@/components/feedback/FeedbackContext";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Worldschool Atlas — directory of worldschooling hubs",
  description: "A browsable directory of worldschooling hubs, pop-ups, communities, and traveling programs for families, with filters by season, cost, and hub type.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col bg-bg text-ink">
        <FeedbackProvider>
          <div className="min-h-0 flex-1">{children}</div>
          <Footer />
        </FeedbackProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: both pass. (Components still reference `var(--font-display)`/`var(--font-body)` — those vars no longer exist so text falls back to Geist. That's fine; later tasks delete the references.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: Quiet Atlas design tokens, Geist-only fonts, cluster/zoom/tooltip styles"
```

---

### Task 2: Image blocklist data + lib helpers (TDD)

**Files:**
- Create: `data/image-blocklist.json`
- Modify: `lib/directory.ts`
- Test: `test/directory.test.ts`

- [ ] **Step 1: Create `data/image-blocklist.json`.**

Check whether `docs/image-audit.md` exists (a background audit agent writes it).
- If it exists: the blocklist is every hub id in its "Hubs needing images" section (both `missing` and `junk` problems). Build the JSON array from that list.
- If it does not exist yet: start with the 7 hubs whose image files are known-missing:

```json
[
  "the-world-school",
  "learn-to-sail-family-adventure-greece-balk",
  "wander-wonder-the-traveling-adventure-scho",
  "outside-the-box-adventures",
  "storylines-ship",
  "worldly-teens",
  "worldschool-au"
]
```

(The audit's junk ids get appended in a follow-up commit when the audit lands — the code paths are identical either way.)

- [ ] **Step 2: Confirm `tsconfig.json` has `"resolveJsonModule": true`** in `compilerOptions` (Next's default does). Add it if missing.

- [ ] **Step 3: Write the failing tests.** Append to `test/directory.test.ts` (it already has a `hub()` factory at the top — reuse it):

```ts
import { hubImage, sortByImagePresence, countActiveFilters } from "../lib/directory";

describe("hubImage", () => {
  it("returns the image path when present and not blocklisted", () => {
    expect(hubImage(hub({ id: "a", image: "/directory-images/a.jpg" }), new Set())).toBe("/directory-images/a.jpg");
  });
  it("returns null for an empty image path", () => {
    expect(hubImage(hub({ id: "a", image: "" }), new Set())).toBeNull();
  });
  it("returns null for blocklisted hubs", () => {
    expect(hubImage(hub({ id: "a", image: "/directory-images/a.jpg" }), new Set(["a"]))).toBeNull();
  });
});

describe("sortByImagePresence", () => {
  it("puts hubs with usable images first, preserving relative order within each group", () => {
    const list = [
      hub({ id: "no1", image: "" }),
      hub({ id: "img1", image: "/x.jpg" }),
      hub({ id: "no2", image: "" }),
      hub({ id: "img2", image: "/y.jpg" }),
    ];
    expect(sortByImagePresence(list, new Set()).map((h) => h.id)).toEqual(["img1", "img2", "no1", "no2"]);
  });
  it("treats blocklisted images as missing", () => {
    const list = [hub({ id: "junk", image: "/x.jpg" }), hub({ id: "good", image: "/y.jpg" })];
    expect(sortByImagePresence(list, new Set(["junk"])).map((h) => h.id)).toEqual(["good", "junk"]);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for an empty filter", () => {
    expect(countActiveFilters({})).toBe(0);
  });
  it("counts the month range as one plus each selected value", () => {
    expect(countActiveFilters({ monthRange: [11, 3], costs: ["free", "low"], categories: ["popup"], participation: ["family"] })).toBe(5);
  });
  it("ignores the text query", () => {
    expect(countActiveFilters({ query: "goa" })).toBe(0);
  });
});
```

Note: imports in this file are at the top — merge these names into the existing `import { ... } from "../lib/directory";` line rather than adding a duplicate import.

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `hubImage`, `sortByImagePresence`, `countActiveFilters` are not exported.

- [ ] **Step 5: Implement in `lib/directory.ts`.** Add near the other helpers (after `isAnywhereHub`):

```ts
import rawImageBlocklist from "../data/image-blocklist.json";

/** Hub ids whose stored image is junk (flag/logo/icon) or missing — render the placeholder instead. */
export const IMAGE_BLOCKLIST: ReadonlySet<string> = new Set(rawImageBlocklist as string[]);

/** The hub's usable card image, or null when absent/blocklisted (→ designed placeholder). */
export function hubImage(h: DirectoryHub, blocklist: ReadonlySet<string> = IMAGE_BLOCKLIST): string | null {
  if (!h.image || blocklist.has(h.id)) return null;
  return h.image;
}

/** Stable partition: hubs with a usable image first, placeholder hubs after. */
export function sortByImagePresence(hubs: DirectoryHub[], blocklist: ReadonlySet<string> = IMAGE_BLOCKLIST): DirectoryHub[] {
  const withImage: DirectoryHub[] = [];
  const without: DirectoryHub[] = [];
  for (const h of hubs) (hubImage(h, blocklist) ? withImage : without).push(h);
  return [...withImage, ...without];
}

/** Number of active facet selections (excludes the search query — it's visible in the header). */
export function countActiveFilters(f: DirectoryFilter): number {
  return (
    (f.monthRange ? 1 : 0) +
    (f.costs?.length ?? 0) +
    (f.categories?.length ?? 0) +
    (f.participation?.length ?? 0) +
    (f.spanishOnly ? 1 : 0) +
    (f.countries?.length ?? 0)
  );
}
```

The `import` goes at the top of the file with the other imports. Use the relative path `../data/image-blocklist.json` (not `@/`) so vitest resolves it without alias config.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 7: Commit**

```bash
git add data/image-blocklist.json lib/directory.ts test/directory.test.ts tsconfig.json
git commit -m "feat: image blocklist + hubImage/sortByImagePresence/countActiveFilters helpers"
```

---

### Task 3: Muted category palette + cost display labels

**Files:**
- Modify: `lib/directory.ts:136-146` (`CATEGORY_META`) and `:164-166` (`COST_META`)

- [ ] **Step 1: Update the meta tables.** Replace the `CATEGORY_META` color values (labels/emojis stay for now — emoji is deleted in Task 14):

```ts
export const CATEGORY_META: Record<HubCategory, { label: string; color: string; emoji: string }> = {
  organic: { label: "Organic", color: "#16a34a", emoji: "🌳" },
  permanent_commercial: { label: "Commercial", color: "#7c3aed", emoji: "🏫" },
  permanent_community: { label: "Community", color: "#0d9488", emoji: "🌿" },
  popup: { label: "Pop-up", color: "#e11d48", emoji: "🎪" },
  traveling: { label: "Traveling", color: "#2563eb", emoji: "⛰️" },
  spanish_immersion: { label: "Spanish", color: "#d97706", emoji: "🗣️" },
  // Hidden buckets — present for type-completeness only; filtered out before any UI renders.
  online_communities: { label: "Online community", color: "#7a8699", emoji: "💬" },
  junk: { label: "Junk", color: "#9aa0a6", emoji: "🗑️" },
};
```

And `COST_META` becomes worded display labels:

```ts
export const COST_META: Record<CostBucket, string> = {
  free: "Free", low: "$ budget", mid: "$$ mid", high: "$$$ premium", unlisted: "Price unlisted",
};
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run lint`
Expected: PASS (tests assert filter behavior, not labels).

- [ ] **Step 3: Commit**

```bash
git add lib/directory.ts
git commit -m "feat: muted category palette + worded cost labels for Quiet Atlas"
```

---

### Task 4: ExplorerHeader component

**Files:**
- Create: `components/directory/ExplorerHeader.tsx`

- [ ] **Step 1: Create the component** (logo + search + count + Contact; search stacks below on mobile):

```tsx
// components/directory/ExplorerHeader.tsx
"use client";

import { useFeedback } from "@/components/feedback/FeedbackContext";

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

function SearchInput({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }) {
  return (
    <label className="relative block w-full">
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search hubs, hosts, places…"
        className="w-full rounded-lg border border-line bg-bg py-[7px] pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint"
      />
    </label>
  );
}

export default function ExplorerHeader({ query, onQueryChange, resultCount }: {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount: number;
}) {
  const { open } = useFeedback();
  return (
    <header className="shrink-0 border-b border-line bg-surface px-4 md:px-5">
      <div className="flex h-14 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-accent text-white">
            <GlobeIcon />
          </span>
          <span className="text-[15.5px] font-extrabold tracking-tight">Worldschool Atlas</span>
        </div>
        <div className="hidden w-[340px] md:block">
          <SearchInput query={query} onQueryChange={onQueryChange} />
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <span className="whitespace-nowrap text-[13px] text-muted">
            <b className="font-bold text-ink">{resultCount}</b> hubs
          </span>
          <button
            type="button"
            onClick={() => open()}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-faint"
          >
            Contact
          </button>
        </div>
      </div>
      <div className="pb-3 md:hidden">
        <SearchInput query={query} onQueryChange={onQueryChange} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify it compiles** (it isn't rendered yet — Task 6 mounts it)

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/directory/ExplorerHeader.tsx
git commit -m "feat: ExplorerHeader — logo, search, hub count, contact"
```

---

### Task 5: FilterBar restyle with exported control groups

**Files:**
- Modify: `components/directory/FilterBar.tsx` (full rewrite)

The control groups are exported so Task 12's mobile `FilterSheet` can reuse them. The brand/search/count row is gone (now in `ExplorerHeader`); `resultCount` stays a prop because the mobile sheet button (Task 12) needs it.

- [ ] **Step 1: Rewrite `components/directory/FilterBar.tsx`:**

```tsx
// components/directory/FilterBar.tsx
"use client";

import { CATEGORY_META, COST_META, DISPLAY_CATEGORIES, countActiveFilters, type CostBucket, type DirectoryFilter, type HubCategory } from "@/lib/directory";

const MONTHS: { n: number; label: string }[] = [
  { n: 1, label: "Jan" }, { n: 2, label: "Feb" }, { n: 3, label: "Mar" }, { n: 4, label: "Apr" },
  { n: 5, label: "May" }, { n: 6, label: "Jun" }, { n: 7, label: "Jul" }, { n: 8, label: "Aug" },
  { n: 9, label: "Sep" }, { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];
const COSTS: CostBucket[] = ["free", "low", "mid", "high", "unlisted"];
const PARTICIPATION: ("family" | "dropoff")[] = ["dropoff", "family"];

const COST_TIPS: Record<CostBucket, string> = {
  free: "Free or donation-based — no tuition required",
  low: "Budget-friendly, typically under $1,000/month",
  mid: "Mid-range, typically $1,000–$3,000/month",
  high: "Premium programs, usually $3,000+/month",
  unlisted: "Price not listed — contact the host directly",
};

const CATEGORY_TIPS: Record<HubCategory, string> = {
  organic: "Informal, parent-led gatherings that emerged naturally from the worldschooling community",
  permanent_commercial: "Professionally run hubs with a structured curriculum and tuition",
  permanent_community: "Established community hubs co-run by worldschooling families with shared costs",
  popup: "Temporary gatherings organized for a specific trip or season",
  traveling: "Mobile programs that move between multiple locations",
  spanish_immersion: "Hubs in Spanish-speaking countries with a focus on language immersion",
  // Hidden categories — never rendered as pills, but the Record must stay exhaustive.
  online_communities: "Online community (not shown on the site)",
  junk: "Parked dead/broken listing (not shown on the site)",
};

const PARTICIPATION_TIPS: Record<"dropoff" | "family", string> = {
  dropoff: "Staffed programs — parents can work or travel independently while kids are cared for",
  family: "Co-op style — parents participate alongside their children throughout the program",
};

const CHIP = "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border px-[11px] py-[5px] text-[12.5px] font-semibold transition-colors";
const CHIP_OFF = "border-line bg-surface text-ink hover:border-faint";
const CHIP_ON = "border-ink bg-ink text-white";
const SELECT = "rounded-[7px] border border-line bg-surface px-2.5 py-[5px] text-[12.5px] font-semibold text-ink outline-none";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const cur = arr ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

export interface ControlProps {
  filter: DirectoryFilter;
  set: (patch: Partial<DirectoryFilter>) => void;
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{children}</span>;
}

export function MonthRangeControls({ filter, set }: ControlProps) {
  // The two pickers define a wrap-aware range. Choosing one end defaults the
  // other to the same month so the range is always valid; "Any month" clears it.
  const setFrom = (v: string) => set({ monthRange: v ? [Number(v), filter.monthRange?.[1] ?? Number(v)] : undefined });
  const setTo = (v: string) => set({ monthRange: v ? [filter.monthRange?.[0] ?? Number(v), Number(v)] : undefined });
  return (
    <span className="inline-flex items-center gap-1.5">
      <select aria-label="From month" value={filter.monthRange?.[0] ?? ""} onChange={(e) => setFrom(e.target.value)}
        title="Show hubs active from this month" className={SELECT}>
        <option value="">Any month</option>
        {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
      </select>
      <span className="text-[12px] text-faint">→</span>
      <select aria-label="To month" value={filter.monthRange?.[1] ?? ""} onChange={(e) => setTo(e.target.value)}
        title="Show hubs still active through this month" className={SELECT}>
        <option value="">Any month</option>
        {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
      </select>
    </span>
  );
}

export function CostChips({ filter, set }: ControlProps) {
  return (
    <>
      {COSTS.map((c) => {
        const on = (filter.costs ?? []).includes(c);
        return (
          <button key={c} type="button" data-tip={COST_TIPS[c]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ costs: toggle(filter.costs, c) })}>
            {COST_META[c]}
          </button>
        );
      })}
    </>
  );
}

export function TypeChips({ filter, set }: ControlProps) {
  return (
    <>
      {DISPLAY_CATEGORIES.map((c) => {
        const on = (filter.categories ?? []).includes(c);
        return (
          <button key={c} type="button" data-tip={CATEGORY_TIPS[c]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ categories: toggle(filter.categories, c) })}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: CATEGORY_META[c].color }} />
            {CATEGORY_META[c].label}
          </button>
        );
      })}
    </>
  );
}

export function ParticipationChips({ filter, set }: ControlProps) {
  return (
    <>
      {PARTICIPATION.map((p) => {
        const on = (filter.participation ?? []).includes(p);
        return (
          <button key={p} type="button" data-tip={PARTICIPATION_TIPS[p]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ participation: toggle(filter.participation, p) })}>
            {p === "dropoff" ? "Drop-off" : "Family"}
          </button>
        );
      })}
    </>
  );
}

interface Props {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  resultCount: number;
  onReset: () => void;
}

export default function FilterBar({ filter, onChange, resultCount, onReset }: Props) {
  void resultCount; // used by the mobile sheet button added in a later task
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  const anyActive = countActiveFilters(filter) > 0 || Boolean(filter.query?.trim());

  return (
    <div className="shrink-0 border-b border-line bg-surface px-4 py-2.5 md:px-5">
      <div className="hidden flex-wrap items-center gap-x-2 gap-y-2 md:flex">
        <GroupLabel>When</GroupLabel>
        <MonthRangeControls filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <GroupLabel>Cost</GroupLabel>
        <CostChips filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <GroupLabel>Type</GroupLabel>
        <TypeChips filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <ParticipationChips filter={filter} set={set} />
        {anyActive && (
          <button type="button" onClick={onReset} className="ml-auto text-[12.5px] font-semibold text-muted hover:text-ink">
            Reset filters
          </button>
        )}
      </div>
      {/* Mobile filter row arrives with the FilterSheet task. */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <CostChips filter={filter} set={set} />
          <TypeChips filter={filter} set={set} />
          <ParticipationChips filter={filter} set={set} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. (`DirectoryExplorer` still passes the same props, so nothing breaks.)

- [ ] **Step 3: Commit**

```bash
git add components/directory/FilterBar.tsx
git commit -m "feat: restyle FilterBar — grouped quiet chips, exported control groups"
```

---

### Task 6: DirectoryExplorer restyle — header, tabs, 2-up grid, image-first sorting

**Files:**
- Modify: `components/directory/DirectoryExplorer.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `components/directory/DirectoryExplorer.tsx`:**

```tsx
// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, isAnywhereHub, sortByImagePresence, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";
import ExplorerHeader from "./ExplorerHeader";
import type { MapBounds } from "./DirectoryMap";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-bg text-sm text-muted">Loading map…</div>,
});

/** Is a point inside the current viewport? Tolerates worldCopyJump longitude wrap. */
function inBounds(coords: [number, number] | null, b: MapBounds | null): boolean {
  if (coords === null || b === null) return true;
  const [lat, lng] = coords;
  if (lat < b.south || lat > b.north) return false;
  const withinLng = (x: number) => x >= b.west && x <= b.east;
  return withinLng(lng) || withinLng(lng - 360) || withinLng(lng + 360);
}

type View = "map" | "anywhere";

export default function DirectoryExplorer({ hubs }: { hubs: DirectoryHub[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [view, setView] = useState<View>("map");

  const filtered = useMemo(() => filterDirectory(hubs, filter), [hubs, filter]);
  // Two disjoint pools: real places (plotted on the map + shown when in view) and
  // location-less "anywhere" hubs (e.g. traveling cohorts) that live in their own tab.
  const placeHubs = useMemo(() => filtered.filter((h) => !isAnywhereHub(h)), [filtered]);
  const anywhereHubs = useMemo(() => sortByImagePresence(filtered.filter(isAnywhereHub)), [filtered]);
  const gridHubs = useMemo(
    () => sortByImagePresence(placeHubs.filter((h) => inBounds(h.coords, bounds))),
    [placeHubs, bounds],
  );
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ExplorerHeader
        query={filter.query ?? ""}
        onQueryChange={(q) => setFilter({ ...filter, query: q })}
        resultCount={filtered.length}
      />
      <FilterBar filter={filter} onChange={setFilter} resultCount={filtered.length} onReset={() => setFilter({})} />

      <TabBar view={view} onChange={setView} mapCount={placeHubs.length} anywhereCount={anywhereHubs.length} />

      {view === "map" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          <div className="min-h-0 overflow-y-auto p-4">
            {placeHubs.length === 0 ? (
              <EmptyMap anywhereCount={anywhereHubs.length} onGoAnywhere={() => setView("anywhere")} />
            ) : gridHubs.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted">No hubs in this part of the map — zoom out or pan to see more.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {gridHubs.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
              </div>
            )}
          </div>

          <div className="relative hidden min-h-0 border-l border-line md:block">
            <DirectoryMap hubs={placeHubs} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId} onBoundsChange={setBounds} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto mb-4 max-w-[760px] rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[13px] leading-snug text-muted">
              <b className="font-bold text-ink">Available anywhere.</b>{" "}
              These hubs have no fixed spot on the map — traveling cohorts and programs you can join from wherever you are. They&apos;re kept out of the map view so place-based hubs are easier to find.
            </p>
          </div>
          {anywhereHubs.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">No anywhere hubs match these filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {anywhereHubs.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
            </div>
          )}
        </div>
      )}

      {selected && <HubModal hub={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/** Map vs. Anywhere switch — quiet underline tabs. */
function TabBar({ view, onChange, mapCount, anywhereCount }: {
  view: View;
  onChange: (v: View) => void;
  mapCount: number;
  anywhereCount: number;
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "map", label: "On the map", count: mapCount },
    { key: "anywhere", label: "Anywhere", count: anywhereCount },
  ];
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-line bg-surface px-4 md:px-5">
      {tabs.map((t) => {
        const on = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
              on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            <span className={`rounded-full px-[7px] py-px text-[11px] font-bold ${
              on ? "bg-accent-soft text-accent" : "border border-line bg-bg text-muted"
            }`}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shown on the map tab when no place-based hub matches — nudges toward the
 *  anywhere tab if the matches all happen to live there. */
function EmptyMap({ anywhereCount, onGoAnywhere }: { anywhereCount: number; onGoAnywhere: () => void }) {
  return (
    <div className="mt-10 text-center text-sm text-muted">
      <p>No place-based hubs match these filters.</p>
      {anywhereCount > 0 && (
        <button
          type="button"
          onClick={onGoAnywhere}
          className="mt-3 inline-flex items-center rounded-lg border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:border-faint"
        >
          {anywhereCount} anywhere {anywhereCount === 1 ? "hub" : "hubs"} match — view them
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add components/directory/DirectoryExplorer.tsx
git commit -m "feat: restyle explorer — header, underline tabs, 2-up grid, image-first sorting"
```

---

### Task 7: HubCard + designed placeholder

**Files:**
- Modify: `components/directory/HubCard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `components/directory/HubCard.tsx`:**

```tsx
// components/directory/HubCard.tsx
"use client";

import { useState } from "react";
import { CATEGORY_META, COST_META, hubCategories, hubImage, type DirectoryHub } from "@/lib/directory";

/** Designed placeholder for hubs without a usable image: a soft category-tinted
 *  gradient, a pin glyph, and the location name. */
function PlaceholderImage({ color, location }: { color: string; location: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 7%, #f6f7f5), color-mix(in srgb, ${color} 16%, #edf0ec))`,
        color,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <span className="px-3 text-center text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ opacity: 0.65 }}>
        {location}
      </span>
    </div>
  );
}

const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact "Dec–Apr" / "Year-round" label from a months[] set, honouring year-end wrap. */
function monthLabel(months: number[]): string {
  if (months.length === 0) return "Flexible";
  if (months.length === 12) return "Year-round";
  const s = [...months].sort((a, b) => a - b);
  // The active span is the run after the largest cyclic gap, so [1,2,3,4,12] → Dec–Apr.
  let gapIdx = s.length - 1;
  let maxGap = s[0] + 12 - s[s.length - 1];
  for (let i = 0; i < s.length - 1; i++) {
    const gap = s[i + 1] - s[i];
    if (gap > maxGap) {
      maxGap = gap;
      gapIdx = i;
    }
  }
  const start = s[(gapIdx + 1) % s.length];
  const end = s[gapIdx];
  return `${MONTH_ABBR[start]}–${MONTH_ABBR[end]}`;
}

export default function HubCard({
  hub, onOpen, onHover,
}: { hub: DirectoryHub; onOpen: (id: string) => void; onHover?: (id: string | null) => void }) {
  const [imgError, setImgError] = useState(false);
  const meta = CATEGORY_META[hub.category];
  const cats = hubCategories(hub);
  const location = [hub.region, hub.country].filter(Boolean).join(", ") || "Location varies";
  const img = hubImage(hub);
  return (
    <button
      type="button"
      onClick={() => onOpen(hub.id)}
      onMouseEnter={() => onHover?.(hub.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(hub.id)}
      onBlur={() => onHover?.(null)}
      className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-all duration-150 hover:-translate-y-[2px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="relative h-[168px] w-full">
        {img && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={hub.name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <PlaceholderImage color={meta.color} location={location} />
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {cats.map((c) => {
            const cm = CATEGORY_META[c];
            return (
              <span key={c} className="flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-ink">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cm.color }} />
                {cm.label}
              </span>
            );
          })}
        </div>
        {hub.participation && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-ink">
            {hub.participation === "dropoff" ? "Drop-off" : "Family"}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <h3 className="text-[14.5px] font-bold leading-tight tracking-[-0.01em] text-ink">{hub.name}</h3>
        <div className="mt-0.5 text-[12.5px] text-muted">{location}</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-accent-soft px-2 py-[3px] text-[11px] font-semibold text-accent">
            {monthLabel(hub.months)}
          </span>
          <span className="rounded-md bg-[#f4f4f5] px-2 py-[3px] text-[11px] font-semibold text-[#52525b]">
            {COST_META[hub.costBucket]}
          </span>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/directory/HubCard.tsx
git commit -m "feat: restyle HubCard — quiet badges, designed placeholder, worded pills"
```

---

### Task 8: HubModal restyle

**Files:**
- Modify: `components/directory/HubModal.tsx`

Keep all content, sections, helpers (`fmtDate`, `eventDates`, `Enrichment`) and the feedback trigger exactly as they are — only presentation changes.

- [ ] **Step 1: Apply these replacements throughout `components/directory/HubModal.tsx`** (every occurrence; functions and JSX structure stay identical):

The modal shell (in `HubModal`):

```tsx
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/55 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-surface text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
```

The image header block (inside the shell; note `hubImage` + placeholder fallback — add `hubImage` to the existing `@/lib/directory` import):

```tsx
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-2xl">
          {hubImage(hub) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hubImage(hub) as string} alt={hub.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `color-mix(in srgb, ${meta.color} 14%, #eef0ec)` }} />
          )}
          <button type="button" onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-[15px] text-ink shadow-sm">✕</button>
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
        </div>
```

Title block: `<h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">` and host line `className="mt-1 text-[14px] font-medium text-muted"`.

The small shared pieces at the bottom of the file:

```tsx
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-line bg-surface px-2 py-[3px] text-[12px] font-semibold text-ink">{children}</span>;
}

const SECTION_TITLE = "mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-faint";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-3">
      <h3 className={SECTION_TITLE}>{title}</h3>
      {children}
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent hover:border-faint">{children}</a>;
}
```

Delete `sectionTitleStyle` and every `style={sectionTitleStyle}` / `style={{ fontFamily: ... }}` in the file. Remove emojis from section titles: `"📅 Upcoming events"` → `"Upcoming events"`, `"🗓️ When to go"` → `"When to go"`, `"⚠️ Needs review"` → `"Needs review"`. Participation tags: `"🎒 Drop-off"` → `"Drop-off"`, `"👪 Family"` → `"Family"`.

Inside `Enrichment`, restyle the colored boxes to quiet tints:
- event rows: `className="rounded-lg border border-line bg-bg px-3 py-2"`, event title `className="text-[14px] font-semibold"`, date `className="shrink-0 text-[12px] font-semibold text-accent"`, `details ↗` link `className="text-accent underline"`
- "Best" row: `className="rounded-lg bg-accent-soft px-3 py-1.5 text-ink"` (keep the `✅ Best:` → change to `Best:`, bold)
- "Avoid" row: `className="rounded-lg bg-[#fef3e2] px-3 py-1.5 text-ink"` (`⚠️ Avoid:` → `Avoid:`)
- flags rows: `className="rounded-lg bg-[#fef9e7] px-3 py-1.5"`
- "Book / enroll ↗" button: `className="mt-3 inline-block rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white"`
- reference links and `source ↗`: `className="text-accent underline"`
- the price-disclaimer line and research-status line keep their classes but drop any `style` props.

The "Flag an error" button:

```tsx
            <button
              type="button"
              onClick={() => openFeedback({ hubId: hub.id, hubName: hub.name, type: "outdated" })}
              className="text-[13px] font-semibold text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              Flag an error
            </button>
```

- [ ] **Step 2: Verify** — `grep -n "font-display\|font-body\|20140d\|caffbf\|ffd6a5\|fff3bf\|rotate-" components/directory/HubModal.tsx` returns nothing; then:

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/directory/HubModal.tsx
git commit -m "feat: restyle HubModal — quiet surfaces, hairline sections, no emoji chrome"
```

---

### Task 9: Footer + FeedbackModal restyle

**Files:**
- Modify: `components/Footer.tsx` (full rewrite)
- Modify: `components/feedback/FeedbackModal.tsx` (presentation only)

- [ ] **Step 1: Rewrite `components/Footer.tsx`:**

```tsx
"use client";

import { useFeedback } from "./feedback/FeedbackContext";

export default function Footer() {
  const { open } = useFeedback();
  return (
    <footer className="border-t border-line bg-surface px-4 py-2.5 text-faint">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-1.5 sm:flex-row sm:justify-between">
        <p className="text-[11.5px] leading-snug">
          Prices &amp; details are community-reported estimates, not quotes — always verify with the provider.
        </p>
        <button
          type="button"
          onClick={() => open()}
          className="text-[12px] font-semibold text-muted hover:text-ink"
        >
          Contact
        </button>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Restyle `components/feedback/FeedbackModal.tsx`** — logic, state, honeypot, and copy stay identical; swap presentation classes:

- overlay: `className="fixed inset-0 z-[3000] flex items-center justify-center bg-ink/55 p-4"`
- panel: `className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-surface p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)]"` (drop the `style` prop)
- heading: `className="text-[19px] font-bold leading-tight tracking-[-0.01em]"` (drop `style`)
- close button: `className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[15px]"`
- success box: `className="mt-5 rounded-xl bg-accent-soft px-4 py-4 text-[14px]"`, its `<p className="font-semibold">Thanks! 🙌</p>` → `Thanks!` (no emoji), its Close button: `className="mt-3 rounded-lg border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold"` (drop `style`)
- every `select`, `textarea`, `input` (except the honeypot): replace `rounded-[10px] border-2 border-[#20140d] bg-white` with `rounded-lg border border-line bg-surface` and add `outline-none focus:border-faint`
- labels keep `text-[13px] font-semibold`
- error text: `className="text-[13px] font-semibold text-[#b00020]"` (unchanged)
- submit button: `className="mt-1 self-start rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60"` (drop `style`)
- the small print keeps its classes; drop any remaining `style={{ fontFamily: ... }}`.

- [ ] **Step 3: Verify** — `grep -rn "font-display\|font-body\|20140d" components/Footer.tsx components/feedback/FeedbackModal.tsx` returns nothing; then:

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/Footer.tsx components/feedback/FeedbackModal.tsx
git commit -m "feat: restyle footer + feedback modal to Quiet Atlas"
```

---

### Task 10: DirectoryMap — Voyager tiles, quiet pins, clusters, legend

**Files:**
- Modify: `components/directory/DirectoryMap.tsx`

- [ ] **Step 1: Replace `pinIcon`** (white stroke + center hole, no emoji, no ink outline):

```tsx
function pinIcon(hub: DirectoryHub, state: PinState): L.DivIcon {
  const color = CATEGORY_META[hub.category].color;
  const size = state === "selected" ? 38 : state === "hovered" ? 34 : 28;
  const innerClass = state === "hovered" ? "ws-pin-inner ws-pin-pop" : "ws-pin-inner";
  const html = `
    <div class="${innerClass}" style="display:inline-block;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))">
        <path d="M12 0C6.5 0 2 4.5 2 10c0 7 10 14 10 14s10-7 10-14C22 4.5 17.5 0 12 0z"
          fill="${color}" stroke="#fff" stroke-width="${state !== "normal" ? 2.5 : 2}"/>
        <circle cx="12" cy="10" r="3.2" fill="rgba(255,255,255,.85)"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "ws-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size + 6],
  });
}
```

- [ ] **Step 2: In the map-mount effect**, swap the tile layer and add cluster icons + a ResizeObserver (needed when the map pane is shown/hidden on mobile in Task 13). Replace the body of the first `useEffect` with:

```tsx
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true, scrollWheelZoom: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      chunkedLoading: true,
      iconCreateFunction: (c) =>
        L.divIcon({ html: `<div class="ws-cluster">${c.getChildCount()}</div>`, className: "ws-pin", iconSize: [30, 30] }),
    });
    map.addLayer(cluster);
    map.on("moveend", () => {
      const b = map.getBounds();
      onBoundsChangeRef.current({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    });
    // The container can start hidden (mobile) or change size; keep Leaflet in sync
    // and run the one-time world fit as soon as the map actually has pixels.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      const el = containerRef.current;
      if (!didInitialFitRef.current && el && el.offsetWidth > 0 && cluster.getLayers().length > 0) {
        map.fitBounds(cluster.getBounds(), { padding: [48, 48], maxZoom: 8 });
        didInitialFitRef.current = true;
      }
    });
    ro.observe(containerRef.current);
    mapRef.current = map;
    clusterRef.current = cluster;
    const markers = markersRef.current;
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; clusterRef.current = null; markers.clear(); };
  }, []);
```

- [ ] **Step 3: Guard the existing initial-fit** in the markers effect so it only fires when the container is visible — replace the `if (!didInitialFitRef.current && located.length > 0)` condition with:

```tsx
    if (!didInitialFitRef.current && located.length > 0 && (containerRef.current?.offsetWidth ?? 0) > 0) {
```

- [ ] **Step 4: Replace the legend JSX** at the bottom of the component (and change the import line to `import { CATEGORY_META, DISPLAY_CATEGORIES, type DirectoryHub } from "@/lib/directory";` — the current legend wrongly lists hidden categories):

```tsx
      <div className="absolute bottom-5 left-3 z-[1000] rounded-[10px] border border-line bg-white/95 px-3 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.07)]" style={{ backdropFilter: "blur(6px)" }}>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Hub type</p>
        {DISPLAY_CATEGORIES.map((c) => (
          <div key={c} className="mb-1 flex items-center gap-2 last:mb-0">
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: CATEGORY_META[c].color }} />
            <span className="text-[11.5px] font-medium text-ink">{CATEGORY_META[c].label}</span>
          </div>
        ))}
      </div>
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/directory/DirectoryMap.tsx
git commit -m "feat: Voyager tiles, white-stroke pins, ink clusters, quiet legend"
```

---

### Task 11: Legacy /map route — tile parity

**Files:**
- Modify: `components/HubMap.tsx:56-59`

- [ ] **Step 1: Swap the tile layer** in `components/HubMap.tsx` (its pins already match the new style — white stroke + center hole — so tiles are the only change):

```tsx
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
```

- [ ] **Step 2: Verify** — `npm run build` passes.

- [ ] **Step 3: Commit**

```bash
git add components/HubMap.tsx
git commit -m "feat: Voyager tiles on legacy /map route"
```

---

### Task 12: Mobile filter sheet

**Files:**
- Create: `components/directory/FilterSheet.tsx`
- Modify: `components/directory/FilterBar.tsx` (mobile row only)

- [ ] **Step 1: Create `components/directory/FilterSheet.tsx`:**

```tsx
// components/directory/FilterSheet.tsx
"use client";

import type { DirectoryFilter } from "@/lib/directory";
import { CostChips, GroupLabel, MonthRangeControls, ParticipationChips, TypeChips } from "./FilterBar";

/** Full filter set as a mobile bottom sheet. Same DirectoryFilter state as the bar. */
export default function FilterSheet({ filter, onChange, resultCount, onClose, onReset }: {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  resultCount: number;
  onClose: () => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  return (
    <div className="fixed inset-0 z-[2500] bg-ink/55 md:hidden" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 shadow-[0_-6px_24px_rgba(0,0,0,0.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">Filters</h2>
          <button type="button" onClick={onReset} className="text-[13px] font-semibold text-muted">Reset</button>
        </div>
        <div className="flex flex-col gap-5">
          <section>
            <GroupLabel>When</GroupLabel>
            <div className="mt-2"><MonthRangeControls filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Cost</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><CostChips filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Type</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><TypeChips filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Participation</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><ParticipationChips filter={filter} set={set} /></div>
          </section>
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-ink py-3 text-[14px] font-bold text-white">
          Show {resultCount} hubs
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `FilterBar.tsx`.** Add imports/state at the top of the component file:

```tsx
import { useState } from "react";
import FilterSheet from "./FilterSheet";
```

Inside `export default function FilterBar(...)`, remove the `void resultCount;` line and add `const [sheetOpen, setSheetOpen] = useState(false);` and `const activeCount = countActiveFilters(filter);`. Then replace the mobile block (`<div className="md:hidden">…</div>`) with:

```tsx
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`${CHIP} ${CHIP_ON} shrink-0`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <CostChips filter={filter} set={set} />
          <TypeChips filter={filter} set={set} />
          <ParticipationChips filter={filter} set={set} />
        </div>
      </div>
      {sheetOpen && (
        <FilterSheet
          filter={filter}
          onChange={onChange}
          resultCount={resultCount}
          onClose={() => setSheetOpen(false)}
          onReset={onReset}
        />
      )}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/directory/FilterSheet.tsx components/directory/FilterBar.tsx
git commit -m "feat: mobile filter sheet + scrolling chip row"
```

---

### Task 13: Mobile map toggle + pin preview sheet

**Files:**
- Modify: `components/directory/DirectoryExplorer.tsx`

- [ ] **Step 1: Add a `useIsMobile` hook and preview/pane state.** In `DirectoryExplorer.tsx`, change the react import to `import { useEffect, useMemo, useState } from "react";`, add to the `@/lib/directory` import: `CATEGORY_META, hubImage, COST_META`, and add above `DirectoryExplorer`:

```tsx
/** True below Tailwind's md breakpoint; drives pin-tap → preview-sheet behavior. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}
```

Inside the component add:

```tsx
  const [mobilePane, setMobilePane] = useState<"list" | "map">("list");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const preview = useMemo(() => hubs.find((h) => h.id === previewId) ?? null, [hubs, previewId]);

  // On mobile a pin tap previews in a bottom sheet; on desktop it opens the modal.
  const handleMapSelect = (id: string) => {
    if (isMobile) setPreviewId(id);
    else setSelectedId(id);
  };
```

- [ ] **Step 2: Make the split panes toggleable.** In the `view === "map"` branch, replace the two pane wrappers:

```tsx
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          <div className={`min-h-0 overflow-y-auto p-4 ${mobilePane === "map" ? "hidden md:block" : ""}`}>
```

and

```tsx
          <div className={`relative min-h-0 border-l border-line ${mobilePane === "map" ? "block" : "hidden"} md:block`}>
            <DirectoryMap hubs={placeHubs} selectedId={selectedId} hoveredId={hoveredId} onSelect={handleMapSelect} onBoundsChange={setBounds} />
          </div>
```

(The `ResizeObserver` added in Task 10 handles Leaflet waking up when the hidden pane becomes visible.)

- [ ] **Step 3: Add the floating toggle + preview sheet** just before `{selected && <HubModal …>}`:

```tsx
      {view === "map" && (
        <button
          type="button"
          onClick={() => { setMobilePane((p) => (p === "map" ? "list" : "map")); setPreviewId(null); }}
          className="fixed bottom-14 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.3)] md:hidden"
        >
          {mobilePane === "map" ? "List" : "Map"}
        </button>
      )}

      {preview && (
        <div className="fixed inset-x-0 bottom-0 z-[1500] md:hidden">
          <div className="rounded-t-2xl border-t border-line bg-surface p-4 shadow-[0_-6px_24px_rgba(0,0,0,0.14)]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => { setSelectedId(preview.id); setPreviewId(null); }}>
              {hubImage(preview) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hubImage(preview) as string} alt={preview.name} className="h-16 w-[84px] shrink-0 rounded-[10px] object-cover" />
              ) : (
                <div className="h-16 w-[84px] shrink-0 rounded-[10px]" style={{ background: `color-mix(in srgb, ${CATEGORY_META[preview.category].color} 14%, #eef0ec)` }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink">{preview.name}</div>
                <div className="truncate text-[12px] text-muted">{[preview.region, preview.country].filter(Boolean).join(", ") || "Location varies"}</div>
                <div className="mt-1.5 flex gap-1.5">
                  <span className="rounded-md bg-[#f4f4f5] px-2 py-[2px] text-[11px] font-semibold text-[#52525b]">{COST_META[preview.costBucket]}</span>
                </div>
              </div>
              <span className="text-faint">›</span>
            </button>
            <button type="button" onClick={() => setPreviewId(null)} className="absolute right-3 top-3 p-1 text-faint" aria-label="Close preview">✕</button>
          </div>
        </div>
      )}
```

(The outer sheet container needs `relative` for the close button — make the inner div `className="relative rounded-t-2xl …"`.)

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/directory/DirectoryExplorer.tsx
git commit -m "feat: mobile map/list toggle + pin preview bottom sheet"
```

---

### Task 14: Cleanup — remove the emoji field

**Files:**
- Modify: `lib/directory.ts:136-146`

- [ ] **Step 1: Confirm nothing uses it anymore:** `grep -rn "\.emoji" app components lib scripts` — expect matches only in `lib/hub.ts` / legacy `/map` components (`TYPE_META`, untouched) or none for `CATEGORY_META`. If a `CATEGORY_META[...].emoji` usage remains, that task was missed — fix it first.

- [ ] **Step 2: Remove `emoji`** from the `CATEGORY_META` type and all eight entries:

```ts
export const CATEGORY_META: Record<HubCategory, { label: string; color: string }> = {
  organic: { label: "Organic", color: "#16a34a" },
  permanent_commercial: { label: "Commercial", color: "#7c3aed" },
  permanent_community: { label: "Community", color: "#0d9488" },
  popup: { label: "Pop-up", color: "#e11d48" },
  traveling: { label: "Traveling", color: "#2563eb" },
  spanish_immersion: { label: "Spanish", color: "#d97706" },
  // Hidden buckets — present for type-completeness only; filtered out before any UI renders.
  online_communities: { label: "Online community", color: "#7a8699" },
  junk: { label: "Junk", color: "#9aa0a6" },
};
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/directory.ts
git commit -m "chore: drop unused emoji field from CATEGORY_META"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full check**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Visual verification with the `run` skill** (or `npm run dev` + a Puppeteer screenshot via `puppeteer-core`, already a devDependency). Verify on desktop viewport (1440×900):
  - header (logo, search, count, Contact), grouped filter chips, underline tabs
  - 2-up card grid; hubs with photos sort before placeholder cards; a blocklisted hub (e.g. `the-world-school` if present in current data) shows the gradient placeholder
  - Voyager map tiles, white-stroke colored pins, ink cluster bubbles, quiet legend
  - hub modal and feedback modal styling; footer
  - no emojis anywhere in UI chrome

- [ ] **Step 3: Mobile viewport (390×844):**
  - search under the logo row; scrolling filter chips; "Filters" button opens the bottom sheet; "Show N hubs" closes it
  - floating "Map" button shows the full-screen map; tapping a pin opens the preview sheet; tapping the preview opens the modal; "List" returns

- [ ] **Step 4: Report results** to the user with screenshots, including anything that didn't match the spec.

---

## Follow-ups (explicitly NOT in this plan)

- Replacing blocklisted images with audit candidates from `docs/image-audit.md` (needs human approval of image licensing) — separate plan once the audit is reviewed.
- Restyling the legacy `/map` route beyond tiles.
