// components/directory/FilterBar.tsx
"use client";

import { useState } from "react";
import { CATEGORY_META, COST_META, DISPLAY_CATEGORIES, countActiveFilters, type CostBucket, type DirectoryFilter, type HubCategory } from "@/lib/directory";
import FilterSheet from "./FilterSheet";

const MONTHS: { n: number; label: string }[] = [
  { n: 1, label: "Jan" }, { n: 2, label: "Feb" }, { n: 3, label: "Mar" }, { n: 4, label: "Apr" },
  { n: 5, label: "May" }, { n: 6, label: "Jun" }, { n: 7, label: "Jul" }, { n: 8, label: "Aug" },
  { n: 9, label: "Sep" }, { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];
const COSTS: CostBucket[] = ["free", "low", "mid", "high", "unlisted"];
const PARTICIPATION: ("family" | "dropoff")[] = ["dropoff", "family"];

const COST_TIPS: Record<CostBucket, string> = {
  free: "Free or donation-based — no tuition required",
  low: "Budget-friendly, typically under $1,000/month",
  mid: "Mid-range, typically $1,000–$3,000/month",
  high: "Premium programs, usually $3,000+/month",
  unlisted: "Price not listed — contact the host directly",
};

const CATEGORY_TIPS: Record<HubCategory, string> = {
  organic: "Informal, parent-led gatherings that emerged naturally from the worldschooling community",
  permanent_commercial: "Professionally run hubs with a structured curriculum and tuition",
  permanent_community: "Established community hubs co-run by worldschooling families with shared costs",
  popup: "Temporary gatherings organized for a specific trip or season",
  traveling: "Mobile programs that move between multiple locations",
  spanish_immersion: "Hubs in Spanish-speaking countries with a focus on language immersion",
  // Hidden categories — never rendered as pills, but the Record must stay exhaustive.
  online_communities: "Online community (not shown on the site)",
  junk: "Parked dead/broken listing (not shown on the site)",
  inactive: "Real hub with no working link — hidden until a link is found",
};

const PARTICIPATION_TIPS: Record<"dropoff" | "family", string> = {
  dropoff: "Staffed programs — parents can work or travel independently while kids are cared for",
  family: "Co-op style — parents participate alongside their children throughout the program",
};

const CHIP = "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border px-[11px] py-[5px] text-[12.5px] font-semibold transition-colors";
const CHIP_OFF = "border-line bg-surface text-ink hover:border-faint";
const CHIP_ON = "border-ink bg-ink text-white";
const SELECT = "rounded-[7px] border border-line bg-surface px-2.5 py-[5px] text-[12.5px] font-semibold text-ink outline-none";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const cur = arr ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

export interface ControlProps {
  filter: DirectoryFilter;
  set: (patch: Partial<DirectoryFilter>) => void;
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{children}</span>;
}

export function MonthRangeControls({ filter, set }: ControlProps) {
  // The two pickers define a wrap-aware range. Choosing one end defaults the
  // other to the same month so the range is always valid; "Any month" clears it.
  const setFrom = (v: string) => set({ monthRange: v ? [Number(v), filter.monthRange?.[1] ?? Number(v)] : undefined });
  const setTo = (v: string) => set({ monthRange: v ? [filter.monthRange?.[0] ?? Number(v), Number(v)] : undefined });
  return (
    <span className="inline-flex items-center gap-1.5">
      <select aria-label="From month" value={filter.monthRange?.[0] ?? ""} onChange={(e) => setFrom(e.target.value)}
        title="Show hubs active from this month" className={SELECT}>
        <option value="">Any month</option>
        {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
      </select>
      <span className="text-[12px] text-faint">→</span>
      <select aria-label="To month" value={filter.monthRange?.[1] ?? ""} onChange={(e) => setTo(e.target.value)}
        title="Show hubs still active through this month" className={SELECT}>
        <option value="">Any month</option>
        {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
      </select>
    </span>
  );
}

export function CostChips({ filter, set }: ControlProps) {
  return (
    <>
      {COSTS.map((c) => {
        const on = (filter.costs ?? []).includes(c);
        return (
          <button key={c} type="button" data-tip={COST_TIPS[c]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ costs: toggle(filter.costs, c) })}>
            {COST_META[c]}
          </button>
        );
      })}
    </>
  );
}

export function TypeChips({ filter, set }: ControlProps) {
  return (
    <>
      {DISPLAY_CATEGORIES.map((c) => {
        const on = (filter.categories ?? []).includes(c);
        return (
          <button key={c} type="button" data-tip={CATEGORY_TIPS[c]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ categories: toggle(filter.categories, c) })}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: CATEGORY_META[c].color }} />
            {CATEGORY_META[c].label}
          </button>
        );
      })}
    </>
  );
}

export function ParticipationChips({ filter, set }: ControlProps) {
  return (
    <>
      {PARTICIPATION.map((p) => {
        const on = (filter.participation ?? []).includes(p);
        return (
          <button key={p} type="button" data-tip={PARTICIPATION_TIPS[p]}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => set({ participation: toggle(filter.participation, p) })}>
            {p === "dropoff" ? "Drop-off" : "Family"}
          </button>
        );
      })}
    </>
  );
}

interface Props {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  resultCount: number;
  onReset: () => void;
}

export default function FilterBar({ filter, onChange, resultCount, onReset }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(filter);
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  const anyActive = countActiveFilters(filter) > 0 || Boolean(filter.query?.trim());

  return (
    <div className="shrink-0 border-b border-line bg-surface px-4 py-2.5 md:px-5">
      <div className="hidden flex-wrap items-center gap-x-2 gap-y-2 md:flex">
        <GroupLabel>When</GroupLabel>
        <MonthRangeControls filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <GroupLabel>Cost</GroupLabel>
        <CostChips filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <GroupLabel>Type</GroupLabel>
        <TypeChips filter={filter} set={set} />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <ParticipationChips filter={filter} set={set} />
        {anyActive && (
          <button type="button" onClick={onReset} className="ml-auto text-[12.5px] font-semibold text-muted hover:text-ink">
            Reset filters
          </button>
        )}
      </div>
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`${CHIP} ${CHIP_ON} shrink-0`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <CostChips filter={filter} set={set} />
          <TypeChips filter={filter} set={set} />
          <ParticipationChips filter={filter} set={set} />
        </div>
      </div>
      {sheetOpen && (
        <FilterSheet
          filter={filter}
          onChange={onChange}
          resultCount={resultCount}
          onClose={() => setSheetOpen(false)}
          onReset={onReset}
        />
      )}
    </div>
  );
}
