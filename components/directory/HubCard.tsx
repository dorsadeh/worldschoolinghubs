// components/directory/HubCard.tsx
"use client";

import { useState } from "react";
import { CATEGORY_META, COST_META, hubCategories, hubImage, type DirectoryHub } from "@/lib/directory";

/** Designed placeholder for hubs without a usable image: a soft category-tinted
 *  gradient, a pin glyph, and the location name. */
function PlaceholderImage({ color, location }: { color: string; location: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 7%, #f6f7f5), color-mix(in srgb, ${color} 16%, #edf0ec))`,
        color,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <span className="px-3 text-center text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ opacity: 0.65 }}>
        {location}
      </span>
    </div>
  );
}

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
  const [imgError, setImgError] = useState(false);
  const meta = CATEGORY_META[hub.category];
  const cats = hubCategories(hub);
  const location = [hub.region, hub.country].filter(Boolean).join(", ") || "Location varies";
  const img = hubImage(hub);
  return (
    <button
      type="button"
      onClick={() => onOpen(hub.id)}
      onMouseEnter={() => onHover?.(hub.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(hub.id)}
      onBlur={() => onHover?.(null)}
      className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-all duration-150 hover:-translate-y-[2px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="relative h-[168px] w-full">
        {img && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={hub.name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <PlaceholderImage color={meta.color} location={location} />
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {cats.map((c) => {
            const cm = CATEGORY_META[c];
            return (
              <span key={c} className="flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-ink">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cm.color }} />
                {cm.label}
              </span>
            );
          })}
        </div>
        {hub.participation && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-ink">
            {hub.participation === "dropoff" ? "Drop-off" : "Family"}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <h3 className="text-[14.5px] font-bold leading-tight tracking-[-0.01em] text-ink">{hub.name}</h3>
        <div className="mt-0.5 text-[12.5px] text-muted">{location}</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-accent-soft px-2 py-[3px] text-[11px] font-semibold text-accent">
            {monthLabel(hub.months)}
          </span>
          <span className="rounded-md bg-[#f4f4f5] px-2 py-[3px] text-[11px] font-semibold text-[#52525b]">
            {COST_META[hub.costBucket]}
          </span>
        </div>
      </div>
    </button>
  );
}
