// app/map/page.tsx
import Link from "next/link";
import { getAllHubs } from "@/lib/hubs";
import { hubTiming } from "@/lib/hub";
import HubExplorer from "@/components/HubExplorer";

export default function MapPage() {
  const hubs = getAllHubs().filter((h) => !hubTiming(h).isPast);
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Worldschooling Hubs — Curated Map</h1>
          <Link href="/" className="text-sm text-zinc-500 underline">← Back to the directory</Link>
        </div>
        <span className="text-xs text-zinc-400">{hubs.length} hubs</span>
      </header>
      <div className="min-h-0 flex-1">
        <HubExplorer hubs={hubs} />
      </div>
    </div>
  );
}
