// components/directory/HubCard.tsx
"use client";

import { CATEGORY_META, COST_META, type DirectoryHub } from "@/lib/directory";

const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact "Dec–Apr" / "Year-round" label from a months[] set. */
function monthLabel(months: number[]): string {
  if (months.length === 0) return "Flexible";
  if (months.length === 12) return "Year-round";
  const sorted = [...months].sort((a, b) => a - b);
  return `${MONTH_ABBR[sorted[0]]}–${MONTH_ABBR[sorted[sorted.length - 1]]}`;
}

export default function HubCard({
  hub, onOpen,
}: { hub: DirectoryHub; onOpen: (id: string) => void }) {
  const meta = CATEGORY_META[hub.category];
  const isData = hub.image.startsWith("data:");
  return (
    <button
      type="button"
      onClick={() => onOpen(hub.id)}
      className="group block w-full overflow-hidden rounded-[20px] border-[2.5px] border-[#20140d] bg-white text-left shadow-[5px_6px_0_#20140d] transition-transform duration-150 hover:-translate-y-[3px] hover:shadow-[8px_10px_0_#20140d]"
    >
      <div className="relative h-[120px] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hub.image || meta.color}
          alt={hub.name}
          className={`h-full w-full ${isData ? "object-cover" : "object-cover"}`}
          style={!hub.image ? { background: meta.color } : undefined}
        />
        <span
          className="absolute left-[10px] top-[10px] -rotate-3 rounded-[9px] border-2 border-[#20140d] px-[9px] py-[2px] text-[11px] font-semibold"
          style={{ background: meta.color, color: "#fff", fontFamily: "var(--font-display)" }}
        >
          {meta.emoji} {meta.label}
        </span>
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
