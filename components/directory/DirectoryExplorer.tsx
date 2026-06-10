// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";
import type { MapBounds } from "./DirectoryMap";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3c6] text-sm text-[#20140d]">Loading map…</div>,
});

/** Is a point inside the current viewport? Tolerates worldCopyJump longitude wrap.
 *  (Coordless hubs are handled separately as "anywhere" hubs, never passed here.) */
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
  const [anywhereOpen, setAnywhereOpen] = useState(false);

  // The map plots every filter-matched hub; the list splits into place-based hubs
  // (shown only when in the current viewport) and location-less "anywhere" hubs.
  const filtered = useMemo(() => filterDirectory(hubs, filter), [hubs, filter]);
  const gridHubs = useMemo(
    () => filtered.filter((h) => h.coords !== null && inBounds(h.coords, bounds)),
    [filtered, bounds],
  );
  const anywhereHubs = useMemo(() => filtered.filter((h) => h.coords === null), [filtered]);
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fff4e6]">
      <FilterBar filter={filter} onChange={setFilter} resultCount={gridHubs.length + anywhereHubs.length} onReset={() => setFilter({})} />

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_1fr]">
        <div className="min-h-0 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[#6b4e3d]">No hubs match these filters.</p>
          ) : (
            <>
              {gridHubs.length === 0 ? (
                <p className="mt-10 text-center text-sm text-[#6b4e3d]">No hubs in this part of the map — zoom out or pan to see more.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {gridHubs.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
                </div>
              )}

              {anywhereHubs.length > 0 && (
                <section className="mt-5">
                  <button
                    type="button"
                    onClick={() => setAnywhereOpen((o) => !o)}
                    aria-expanded={anywhereOpen}
                    className="flex w-full items-center gap-2 rounded-[14px] border-[2.5px] border-[#20140d] bg-[#cae8ff] px-4 py-2.5 text-left shadow-[3px_4px_0_#20140d] transition-transform duration-150 hover:-translate-y-[1px] hover:shadow-[4px_5px_0_#20140d]"
                    style={{ fontFamily: "var(--font-display)", color: "#20140d" }}
                  >
                    <span className="text-[18px]">🌍</span>
                    <span className="text-[15px] font-bold">Available anywhere</span>
                    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-[#20140d] bg-white px-1.5 text-[12px] font-bold">{anywhereHubs.length}</span>
                    <span className="ml-auto text-[13px] font-semibold text-[#3a2a1d]">
                      {anywhereOpen ? "Hide" : "Show"} <span className={`inline-block transition-transform duration-200 ${anywhereOpen ? "rotate-180" : ""}`}>▾</span>
                    </span>
                  </button>
                  <p className="mt-1 px-1 text-[12px] text-[#6b4e3d]">Online & traveling hubs with no fixed location — not pinned on the map.</p>
                  {anywhereOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {anywhereHubs.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} onHover={setHoveredId} />)}
                    </div>
                  )}
                </section>
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
