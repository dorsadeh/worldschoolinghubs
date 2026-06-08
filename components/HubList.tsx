"use client";

import { TYPE_META, TIMING_TONE, hasCoordinates, hubTiming, type Hub } from "@/lib/hub";

interface HubListProps {
  hubs: Hub[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function locationLine(hub: Hub): string {
  if (hub.location.online) return "Online";
  const parts = [hub.location.city, hub.location.region, hub.location.country].filter(Boolean);
  return parts.join(", ") || hub.location.note || "Location TBD";
}

export default function HubList({ hubs, selectedId, onSelect }: HubListProps) {
  if (hubs.length === 0) {
    return <p className="p-4 text-sm text-zinc-500">No hubs match these filters.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {hubs.map((hub) => {
        const meta = TYPE_META[hub.type];
        const timing = hubTiming(hub);
        const selected = hub.id === selectedId;
        return (
          <li key={hub.id}>
            <button
              onClick={() => onSelect(hub.id)}
              className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                selected ? "bg-zinc-100 dark:bg-zinc-800" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  title={meta.label}
                />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{hub.name}</span>
                {!hub.verified && (
                  <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    unverified
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500">{locationLine(hub)}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TIMING_TONE[timing.tone]}`}>
                  {timing.label}
                </span>
                {hub.price && <span className="text-[11px] text-zinc-400">{hub.price.length > 28 ? hub.price.slice(0, 28) + "…" : hub.price}</span>}
              </div>
              {!hasCoordinates(hub) && !hub.location.online && (
                <span className="text-[10px] text-zinc-400">not pinned on map</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
