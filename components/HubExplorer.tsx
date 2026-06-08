"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterHubs, uniqueCountries, type Hub, type HubType } from "@/lib/hub";
import Filters from "./Filters";
import HubList from "./HubList";
import HubDetail from "./HubDetail";
import Legend from "./Legend";
import MapErrorBoundary from "./MapErrorBoundary";

// Leaflet touches `window`, so the map must be client-only.
const HubMap = dynamic(() => import("./HubMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-900">
      Loading map…
    </div>
  ),
});

export default function HubExplorer({ hubs }: { hubs: Hub[] }) {
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<HubType[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const countries = useMemo(() => uniqueCountries(hubs), [hubs]);

  const filtered = useMemo(
    () =>
      filterHubs(hubs, {
        query,
        types: selectedTypes,
        countries: selectedCountry ? [selectedCountry] : undefined,
        activeOnly,
      }),
    [hubs, query, selectedTypes, selectedCountry, activeOnly],
  );

  const selectedHub = useMemo(
    () => filtered.find((h) => h.id === selectedId) ?? hubs.find((h) => h.id === selectedId) ?? null,
    [filtered, hubs, selectedId],
  );

  function toggleType(t: HubType) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const hasActiveFilters =
    query.trim() !== "" || selectedTypes.length > 0 || selectedCountry !== "" || activeOnly;

  function resetFilters() {
    setQuery("");
    setSelectedTypes([]);
    setSelectedCountry("");
    setActiveOnly(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Sidebar: filters + list */}
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-zinc-200 dark:border-zinc-800 md:max-h-none md:w-[360px] md:border-r">
        <Filters
          query={query}
          onQuery={setQuery}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          countries={countries}
          selectedCountry={selectedCountry}
          onCountry={setSelectedCountry}
          activeOnly={activeOnly}
          onActiveOnly={setActiveOnly}
          resultCount={filtered.length}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <HubList hubs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </aside>

      {/* Map + detail overlay */}
      <main className="relative min-h-0 flex-1">
        <MapErrorBoundary>
          <HubMap hubs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </MapErrorBoundary>
        <Legend />
        <div
          className={`absolute right-0 top-0 z-[1000] h-full w-full max-w-sm transform border-l border-zinc-200 bg-white shadow-xl transition-transform duration-300 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
            selectedHub ? "translate-x-0" : "pointer-events-none translate-x-full"
          }`}
        >
          {selectedHub && <HubDetail hub={selectedHub} onClose={() => setSelectedId(null)} />}
        </div>
      </main>
    </div>
  );
}
