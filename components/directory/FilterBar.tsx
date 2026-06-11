// components/directory/FilterBar.tsx
"use client";

import { CATEGORY_META, COST_META, DISPLAY_CATEGORIES, type CostBucket, type DirectoryFilter, type HubCategory } from "@/lib/directory";

const MONTHS: { n: number; label: string }[] = [
  { n: 1, label: "Jan" }, { n: 2, label: "Feb" }, { n: 3, label: "Mar" }, { n: 4, label: "Apr" },
  { n: 5, label: "May" }, { n: 6, label: "Jun" }, { n: 7, label: "Jul" }, { n: 8, label: "Aug" },
  { n: 9, label: "Sep" }, { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];
const COSTS: CostBucket[] = ["free", "low", "mid", "high", "unlisted"];
const CATEGORIES = DISPLAY_CATEGORIES;
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
};

const PARTICIPATION_TIPS: Record<"dropoff" | "family", string> = {
  dropoff: "Staffed programs — parents can work or travel independently while kids are cared for",
  family: "Co-op style — parents participate alongside their children throughout the program",
};

const PILL = "rounded-full border-2 border-[#20140d] bg-white px-[11px] py-[4px] text-[12.5px] font-medium cursor-pointer transition-colors";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const cur = arr ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

interface Props {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  resultCount: number;
  onReset: () => void;
}

export default function FilterBar({ filter, onChange, resultCount, onReset }: Props) {
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  // The two pickers define a wrap-aware range. Choosing one end defaults the
  // other to the same month so the range is always valid; "Any month" clears it.
  const setFrom = (v: string) => set({ monthRange: v ? [Number(v), filter.monthRange?.[1] ?? Number(v)] : undefined });
  const setTo = (v: string) => set({ monthRange: v ? [filter.monthRange?.[0] ?? Number(v), Number(v)] : undefined });
  const display = { fontFamily: "var(--font-display)" };
  const active = (on: boolean, bg: string) => (on ? { background: bg } : undefined);

  return (
    <div className="border-b-[2.5px] border-[#20140d] bg-white px-4 py-3" style={{ fontFamily: "var(--font-body)", color: "#20140d" }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[20px]" style={{ ...display, fontWeight: 800 }}>🌍 Worldschool Atlas</span>
        <input
          value={filter.query ?? ""}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search hubs, hosts, places…"
          className="ml-2 w-[230px] rounded-full border-2 border-[#20140d] bg-[#fff8ef] px-[14px] py-[6px] text-[13px] outline-none"
        />
        <span className="ml-auto rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[12px] py-[3px] text-[14px]" style={{ ...display, fontWeight: 600 }}>
          {resultCount} hubs
        </span>
        <button type="button" onClick={onReset} className="rounded-full border-2 border-[#20140d] px-[12px] py-[3px] text-[13px]" style={{ ...display, fontWeight: 600 }}>
          Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-[12px] opacity-70" style={display} data-tip="Show hubs that are active from this month onward">When</span>
        <select
          aria-label="From month"
          value={filter.monthRange?.[0] ?? ""}
          onChange={(e) => setFrom(e.target.value)}
          title="Show hubs active from this month"
          className="rounded-full border-2 border-[#20140d] bg-white px-[11px] py-[5px] text-[12.5px]" style={display}>
          <option value="">Any month</option>
          {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
        </select>
        <span className="text-[12px] opacity-70" style={display}>to</span>
        <select
          aria-label="To month"
          value={filter.monthRange?.[1] ?? ""}
          onChange={(e) => setTo(e.target.value)}
          title="Show hubs still active through this month"
          className="rounded-full border-2 border-[#20140d] bg-white px-[11px] py-[5px] text-[12.5px]" style={display}>
          <option value="">Any month</option>
          {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
        </select>

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        <span className="text-[12px] opacity-70" style={display}>Cost</span>
        {COSTS.map((c) => (
          <button key={c} type="button" className={PILL} data-tip={COST_TIPS[c]}
            style={{ ...display, ...active((filter.costs ?? []).includes(c), "#ffd6a5") }}
            onClick={() => set({ costs: toggle(filter.costs, c) })}>{COST_META[c]}</button>
        ))}

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        <span className="text-[12px] opacity-70" style={display}>Type</span>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={PILL} data-tip={CATEGORY_TIPS[c]}
            style={{ ...display, ...active((filter.categories ?? []).includes(c), CATEGORY_META[c].color), color: (filter.categories ?? []).includes(c) ? "#fff" : "#20140d" }}
            onClick={() => set({ categories: toggle(filter.categories, c) })}>{CATEGORY_META[c].label}</button>
        ))}

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        {PARTICIPATION.map((p) => (
          <button key={p} type="button" className={PILL} data-tip={PARTICIPATION_TIPS[p]}
            style={{ ...display, ...active((filter.participation ?? []).includes(p), "#a0c4ff") }}
            onClick={() => set({ participation: toggle(filter.participation, p) })}>{p === "dropoff" ? "🎒 Drop-off" : "👪 Family"}</button>
        ))}
      </div>
    </div>
  );
}
