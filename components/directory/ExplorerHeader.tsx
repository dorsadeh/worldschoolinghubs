// components/directory/ExplorerHeader.tsx
"use client";

import { useFeedback } from "@/components/feedback/FeedbackContext";

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

function SearchInput({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }) {
  return (
    <label className="relative block w-full">
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search hubs, hosts, places…"
        className="w-full rounded-lg border border-line bg-bg py-[7px] pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint"
      />
    </label>
  );
}

export default function ExplorerHeader({ query, onQueryChange, resultCount }: {
  query: string;
  onQueryChange: (q: string) => void;
  resultCount: number;
}) {
  const { open } = useFeedback();
  return (
    <header className="shrink-0 border-b border-line bg-surface px-4 md:px-5">
      <div className="flex h-14 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-accent text-white">
            <GlobeIcon />
          </span>
          <span className="text-[15.5px] font-extrabold tracking-tight">Worldschool Atlas</span>
        </div>
        <div className="hidden w-[340px] md:block">
          <SearchInput query={query} onQueryChange={onQueryChange} />
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <span className="whitespace-nowrap text-[13px] text-muted">
            <b className="font-bold text-ink">{resultCount}</b> hubs
          </span>
          <button
            type="button"
            onClick={() => open()}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-faint"
          >
            Contact
          </button>
        </div>
      </div>
      <div className="pb-3 md:hidden">
        <SearchInput query={query} onQueryChange={onQueryChange} />
      </div>
    </header>
  );
}
