// components/directory/HubCard.tsx
"use client";

import { CATEGORY_META, COST_META, hubCategories, type DirectoryHub } from "@/lib/directory";

const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact "Dec–Apr" / "Year-round" label from a months[] set, honouring year-end wrap. */
function monthLabel(months: number[]): string {
  if (months.length === 0) return "Flexible";
  if (months.length === 12) return "Year-round";
  const s = [...months].sort((a, b) => a - b);
  // The active span is the run after the largest cyclic gap, so [1,2,3,4,12] → Dec–Apr.
  let gapIdx = s.length - 1;
  let maxGap = s[0] + 12 - s[s.length - 1];
  for (let i = 0; i < s.length - 1; i++) {
    const gap = s[i + 1] - s[i];
    if (gap > maxGap) {
      maxGap = gap;
      gapIdx = i;
    }
  }
  const start = s[(gapIdx + 1) % s.length];
  const end = s[gapIdx];
  return `${MONTH_ABBR[start]}–${MONTH_ABBR[end]}`;
}

export default function HubCard({
  hub, onOpen, onHover,
}: { hub: DirectoryHub; onOpen: (id: string) => void; onHover?: (id: string | null) => void }) {
  const meta = CATEGORY_META[hub.category];
  const cats = hubCategories(hub);
  return (
    <button
      type="button"
      onClick={() => onOpen(hub.id)}
      onMouseEnter={() => onHover?.(hub.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(hub.id)}
      onBlur={() => onHover?.(null)}
      className="group block w-full overflow-hidden rounded-[20px] border-[2.5px] border-[#20140d] bg-white text-left shadow-[5px_6px_0_#20140d] transition-transform duration-150 hover:-translate-y-[3px] hover:shadow-[8px_10px_0_#20140d]"
    >
      <div className="relative h-[120px] w-full">
        {hub.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hub.image} alt={hub.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: meta.color }} />
        )}
        <div className="absolute left-[10px] top-[10px] flex flex-wrap gap-[5px]">
          {cats.map((c) => {
            const cm = CATEGORY_META[c];
            return (
              <span
                key={c}
                className="-rotate-3 rounded-[9px] border-2 border-[#20140d] px-[9px] py-[2px] text-[11px] font-semibold"
                style={{ background: cm.color, color: "#fff", fontFamily: "var(--font-display)" }}
              >
                {cm.emoji} {cm.label}
              </span>
            );
          })}
        </div>
        {hub.participation && (
          <span className="absolute right-[10px] top-[10px] flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#20140d] bg-white text-[13px]">
            {hub.participation === "dropoff" ? "🎒" : "👪"}
          </span>
        )}
      </div>
      <div className="px-[14px] pb-[14px] pt-[11px]" style={{ fontFamily: "var(--font-body)", color: "#20140d" }}>
        <h3 className="mb-[3px] text-[16px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {hub.name}
        </h3>
        <div className="text-[12.5px] font-semibold text-[#6b4e3d]">
          {[hub.region, hub.country].filter(Boolean).join(", ") || "Location varies"}
        </div>
        <div className="mt-[9px] flex flex-wrap gap-[6px]">
          <span className="rounded-[7px] border-[1.5px] border-[#20140d] bg-[#caffbf] px-[7px] py-px text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {monthLabel(hub.months)}
          </span>
          <span className="rounded-[7px] border-[1.5px] border-[#20140d] bg-[#ffd6a5] px-[7px] py-px text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {COST_META[hub.costBucket]}
          </span>
        </div>
      </div>
    </button>
  );
}
