// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, uniqueDirectoryCountries, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";
import type { MapBounds } from "./DirectoryMap";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3c6] text-sm text-[#20140d]">Loading map…</div>,
});

/** Is a hub inside the current viewport? Location-less hubs always pass — the
 *  viewport can't hide what it can't plot. Tolerates worldCopyJump longitude wrap. */
function inBounds(coords: [number, number] | null, b: MapBounds | null): boolean {
  if (coords === null || b === null) return true;
  const [lat, lng] = coords;
  if (lat < b.south || lat > b.north) return false;
  const withinLng = (x: number) => x >= b.west && x <= b.east;
  return withinLng(lng) || withinLng(lng - 360) || withinLng(lng + 360);
}

export default function DirectoryExplorer({ hubs }: { hubs: DirectoryHub[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);

  const countries = useMemo(() => uniqueDirectoryCountries(hubs), [hubs]);
  // The map plots every filter-matched hub; the list narrows to those in view.
  const filtered = useMemo(() => filterDirectory(hubs, filter), [hubs, filter]);
  const visible = useMemo(() => filtered.filter((h) => inBounds(h.coords, bounds)), [filtered, bounds]);
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);
  const offMap = visible.filter((h) => h.coords === null).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fff4e6]">
      <FilterBar filter={filter} onChange={setFilter} countries={countries} resultCount={visible.length} onReset={() => setFilter({})} />

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_1fr]">
        <div className="min-h-0 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[#6b4e3d]">
              {filtered.length === 0 ? "No hubs match these filters." : "No hubs in this part of the map — zoom out or pan to see more."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
              </div>
              {offMap > 0 && (
                <p className="mt-4 text-center text-[12px] text-[#6b4e3d]">+{offMap} hub{offMap > 1 ? "s" : ""} without a fixed location (not shown on map)</p>
              )}
            </>
          )}
        </div>

        <div className="relative hidden min-h-0 border-l-[2.5px] border-[#20140d] md:block">
          <DirectoryMap hubs={filtered} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId} onBoundsChange={setBounds} />
        </div>
      </div>

      {selected && <HubModal hub={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
