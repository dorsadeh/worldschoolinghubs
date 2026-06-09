// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, uniqueDirectoryCountries, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3c6] text-sm text-[#20140d]">Loading map…</div>,
});

export default function DirectoryExplorer({ hubs }: { hubs: DirectoryHub[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const countries = useMemo(() => uniqueDirectoryCountries(hubs), [hubs]);
  const filtered = useMemo(() => filterDirectory(hubs, filter), [hubs, filter]);
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);
  const offMap = filtered.filter((h) => h.coords === null).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fff4e6]">
      <FilterBar filter={filter} onChange={setFilter} countries={countries} resultCount={filtered.length} onReset={() => setFilter({})} />

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_1fr]">
        <div className="min-h-0 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[#6b4e3d]">No hubs match these filters.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} />)}
              </div>
              {offMap > 0 && (
                <p className="mt-4 text-center text-[12px] text-[#6b4e3d]">+{offMap} hub{offMap > 1 ? "s" : ""} without a fixed location (not shown on map)</p>
              )}
            </>
          )}
        </div>

        <div className="relative hidden min-h-0 border-l-[2.5px] border-[#20140d] md:block">
          <DirectoryMap hubs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      {selected && <HubModal hub={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
