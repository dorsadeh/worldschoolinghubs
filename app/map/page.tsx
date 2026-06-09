// app/map/page.tsx
import { getAllHubs } from "@/lib/hubs";
import HubExplorer from "@/components/HubExplorer";

export default function MapPage() {
  const hubs = getAllHubs();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Worldschooling Hubs — Curated Map</h1>
          <a href="/" className="text-sm text-zinc-500 underline">← Back to the directory</a>
        </div>
        <span className="text-xs text-zinc-400">{hubs.length} hubs</span>
      </header>
      <div className="min-h-0 flex-1">
        <HubExplorer hubs={hubs} />
      </div>
    </div>
  );
}
