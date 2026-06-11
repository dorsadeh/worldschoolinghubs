// components/directory/DirectoryExplorer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CATEGORY_META, hubImage, COST_META, filterDirectory, isAnywhereHub, sortByImagePresence, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
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

export default function DirectoryExplorer({ hubs }: { hubs: DirectoryHub[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [view, setView] = useState<View>("map");
  const [mobilePane, setMobilePane] = useState<"list" | "map">("list");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const preview = useMemo(() => hubs.find((h) => h.id === previewId) ?? null, [hubs, previewId]);

  // On mobile a pin tap previews in a bottom sheet; on desktop it opens the modal.
  const handleMapSelect = (id: string) => {
    if (isMobile) setPreviewId(id);
    else setSelectedId(id);
  };

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
          <div className={`min-h-0 overflow-y-auto p-4 ${mobilePane === "map" ? "hidden md:block" : ""}`}>
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

          <div className={`relative min-h-0 border-l border-line ${mobilePane === "map" ? "block" : "hidden"} md:block`}>
            <DirectoryMap hubs={placeHubs} selectedId={selectedId} hoveredId={hoveredId} onSelect={handleMapSelect} onBoundsChange={setBounds} />
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
          <div className="relative rounded-t-2xl border-t border-line bg-surface p-4 shadow-[0_-6px_24px_rgba(0,0,0,0.14)]">
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
