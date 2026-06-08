"use client";

import { HUB_TYPES, TYPE_META } from "@/lib/hub";

export default function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-zinc-200/70 bg-white/90 p-2.5 text-xs shadow-md backdrop-blur dark:border-zinc-700/70 dark:bg-zinc-900/90">
      <div className="mb-1 font-semibold text-zinc-500">Hub type</div>
      <ul className="flex flex-col gap-1">
        {HUB_TYPES.map((t) => (
          <li key={t} className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_META[t].color }} />
            {TYPE_META[t].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
