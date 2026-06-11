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
