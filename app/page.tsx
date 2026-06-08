import { getAllHubs } from "@/lib/hubs";
import HubExplorer from "@/components/HubExplorer";

export default function Home() {
  const hubs = getAllHubs();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Worldschooling Hubs</h1>
          <span className="hidden text-sm text-zinc-500 sm:inline">
            A curated map of where worldschooling families gather
          </span>
        </div>
        <span className="text-xs text-zinc-400">{hubs.length} hubs</span>
      </header>
      <div className="min-h-0 flex-1">
        {hubs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-500">
            No hubs yet. Add JSON files under <code className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">data/hubs/</code> to populate the map.
          </div>
        ) : (
          <HubExplorer hubs={hubs} />
        )}
      </div>
    </div>
  );
}
