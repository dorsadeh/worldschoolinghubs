// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, isAnywhereHub, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";
import type { MapBounds } from "./DirectoryMap";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3c6] text-sm text-[#20140d]">Loading map…</div>,
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
  // location-less "anywhere" hubs (online/traveling) that live in their own tab.
  const placeHubs = useMemo(() => filtered.filter((h) => !isAnywhereHub(h)), [filtered]);
  const anywhereHubs = useMemo(() => filtered.filter(isAnywhereHub), [filtered]);
  const gridHubs = useMemo(() => placeHubs.filter((h) => inBounds(h.coords, bounds)), [placeHubs, bounds]);
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fff4e6]">
      <FilterBar filter={filter} onChange={setFilter} resultCount={filtered.length} onReset={() => setFilter({})} />

      <TabBar view={view} onChange={setView} mapCount={placeHubs.length} anywhereCount={anywhereHubs.length} />

      {view === "map" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_1fr]">
          <div className="min-h-0 overflow-y-auto p-4">
            {placeHubs.length === 0 ? (
              <EmptyMap anywhereCount={anywhereHubs.length} onGoAnywhere={() => setView("anywhere")} />
            ) : gridHubs.length === 0 ? (
              <p className="mt-10 text-center text-sm text-[#6b4e3d]">No hubs in this part of the map — zoom out or pan to see more.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {gridHubs.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
              </div>
            )}
          </div>

          <div className="relative hidden min-h-0 border-l-[2.5px] border-[#20140d] md:block">
            <DirectoryMap hubs={placeHubs} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId} onBoundsChange={setBounds} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto mb-4 flex max-w-[760px] items-start gap-3 rounded-[16px] border-[2.5px] border-[#20140d] bg-[#cae8ff] px-4 py-3 shadow-[3px_4px_0_#20140d]">
            <span className="text-[22px] leading-none">🌍</span>
            <p className="text-[13px] leading-snug text-[#20140d]">
              <span className="font-bold" style={{ fontFamily: "var(--font-display)" }}>Online &amp; available anywhere.</span>{" "}
              These hubs have no fixed spot on the map — virtual programs and traveling cohorts you can join from wherever you are. They&apos;re kept out of the map view so place-based hubs are easier to find.
            </p>
          </div>
          {anywhereHubs.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[#6b4e3d]">No online or anywhere hubs match these filters.</p>
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

/** Map vs. Online & Anywhere switch. Matches the bold-playful pill aesthetic. */
function TabBar({ view, onChange, mapCount, anywhereCount }: {
  view: View;
  onChange: (v: View) => void;
  mapCount: number;
  anywhereCount: number;
}) {
  const tabs: { key: View; emoji: string; label: string; count: number; bg: string }[] = [
    { key: "map", emoji: "🗺️", label: "On the map", count: mapCount, bg: "#caffbf" },
    { key: "anywhere", emoji: "🌍", label: "Online & anywhere", count: anywhereCount, bg: "#cae8ff" },
  ];
  return (
    <div className="flex items-center gap-2 border-b-[2.5px] border-[#20140d] bg-[#fff4e6] px-4 py-2.5">
      {tabs.map((t) => {
        const on = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            className={`flex items-center gap-2 rounded-full border-[2.5px] border-[#20140d] px-[14px] py-[6px] text-[13.5px] transition-all duration-150 ${
              on ? "-translate-y-[1px] shadow-[3px_4px_0_#20140d]" : "hover:-translate-y-[1px] hover:shadow-[2px_3px_0_#20140d]"
            }`}
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#20140d", background: on ? t.bg : "#fff" }}
          >
            <span className="text-[15px]">{t.emoji}</span>
            <span>{t.label}</span>
            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-[#20140d] bg-white px-1.5 text-[11px] font-bold">{t.count}</span>
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
    <div className="mt-10 text-center text-sm text-[#6b4e3d]">
      <p>No place-based hubs match these filters.</p>
      {anywhereCount > 0 && (
        <button
          type="button"
          onClick={onGoAnywhere}
          className="mt-3 inline-flex items-center gap-2 rounded-full border-[2.5px] border-[#20140d] bg-[#cae8ff] px-[14px] py-[6px] text-[13px] text-[#20140d] shadow-[3px_4px_0_#20140d] transition-transform duration-150 hover:-translate-y-[1px]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          🌍 {anywhereCount} online &amp; anywhere {anywhereCount === 1 ? "hub" : "hubs"} match — view them
        </button>
      )}
    </div>
  );
}
