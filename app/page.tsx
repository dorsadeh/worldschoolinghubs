import { readFileSync } from "node:fs";
import { join } from "node:path";
import DirectoryExplorer from "@/components/directory/DirectoryExplorer";
import { isDirectoryHubPast, type DirectoryHub } from "@/lib/directory";

function getDirectory(): DirectoryHub[] {
  const path = join(process.cwd(), "public", "directory.json");
  const all = JSON.parse(readFileSync(path, "utf8")) as DirectoryHub[];
  return all.filter((h) => !isDirectoryHubPast(h));
}

export default function Home() {
  const hubs = getDirectory();
  return (
    <div className="h-screen">
      <DirectoryExplorer hubs={hubs} />
    </div>
  );
}
