import { readFileSync } from "node:fs";
import { join } from "node:path";
import DirectoryExplorer from "@/components/directory/DirectoryExplorer";
import { isDirectoryHubPast, isHiddenHub, type DirectoryHub } from "@/lib/directory";

function getDirectory(): DirectoryHub[] {
  const path = join(process.cwd(), "public", "directory.json");
  const all = JSON.parse(readFileSync(path, "utf8")) as DirectoryHub[];
  // Hidden categories (junk, online communities) stay in directory.json but are
  // never shown; past-dated hubs are dropped too.
  return all.filter((h) => !isHiddenHub(h) && !isDirectoryHubPast(h));
}

export default function Home() {
  const hubs = getDirectory();
  return (
    <div className="h-full">
      <DirectoryExplorer hubs={hubs} />
    </div>
  );
}
