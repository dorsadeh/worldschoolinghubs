"use client";

import { HUB_TYPES, TYPE_META, type HubType } from "@/lib/hub";

interface FiltersProps {
  query: string;
  onQuery: (q: string) => void;
  selectedTypes: HubType[];
  onToggleType: (t: HubType) => void;
  countries: string[];
  selectedCountry: string;
  onCountry: (c: string) => void;
  activeOnly: boolean;
  onActiveOnly: (v: boolean) => void;
  resultCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export default function Filters({
  query,
  onQuery,
  selectedTypes,
  onToggleType,
  countries,
  selectedCountry,
  onCountry,
  activeOnly,
  onActiveOnly,
  resultCount,
  hasActiveFilters,
  onReset,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800">
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search name, city, country…"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Type</span>
        <div className="flex flex-wrap gap-1.5">
          {HUB_TYPES.map((t) => {
            const active = selectedTypes.length === 0 || selectedTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => onToggleType(t)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-transparent text-white"
                    : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
                }`}
                style={active ? { backgroundColor: TYPE_META[t].color } : undefined}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : TYPE_META[t].color }}
                />
                {TYPE_META[t].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={selectedCountry}
          onChange={(e) => onCountry(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => onActiveOnly(e.target.checked)}
          />
          Active
        </label>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{resultCount} hub(s)</span>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
