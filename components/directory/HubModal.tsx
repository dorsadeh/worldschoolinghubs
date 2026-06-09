// components/directory/HubModal.tsx
"use client";

import { CATEGORY_META, COST_META, type DirectoryHub } from "@/lib/directory";

export default function HubModal({ hub, onClose }: { hub: DirectoryHub; onClose: () => void }) {
  const meta = CATEGORY_META[hub.category];
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#20140d99] p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-[22px] border-[2.5px] border-[#20140d] bg-[#fffaf3] shadow-[8px_10px_0_#20140d]"
        style={{ fontFamily: "var(--font-body)", color: "#20140d" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-[19px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hub.image} alt={hub.name} className="h-full w-full object-cover" style={!hub.image ? { background: meta.color } : undefined} />
          <button type="button" onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#20140d] bg-white text-[16px]">✕</button>
          <span className="absolute bottom-3 left-3 -rotate-2 rounded-[9px] border-2 border-[#20140d] px-[10px] py-[3px] text-[12px] font-semibold"
            style={{ background: meta.color, color: "#fff", fontFamily: "var(--font-display)" }}>{meta.emoji} {meta.label}</span>
        </div>

        <div className="p-5">
          <h2 className="text-[24px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>{hub.name}</h2>
          {hub.host && <p className="mt-1 text-[14px] font-semibold text-[#6b4e3d]">Hosted by {hub.host}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {[hub.region, hub.country].filter(Boolean).join(", ") && <Tag>{[hub.region, hub.country].filter(Boolean).join(", ")}</Tag>}
            {hub.season && <Tag>{hub.season}</Tag>}
            <Tag>{COST_META[hub.costBucket]}{hub.price ? ` · ${hub.price}` : ""}</Tag>
            {hub.participation && <Tag>{hub.participation === "dropoff" ? "🎒 Drop-off" : "👪 Family"}</Tag>}
            {hub.nationality && <Tag>{hub.nationality}</Tag>}
          </div>

          {hub.summary && <p className="mt-4 text-[15px] leading-relaxed">{hub.summary}</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            {hub.website && <Link href={hub.website.startsWith("http") ? hub.website : `https://${hub.website}`}>Website ↗</Link>}
            {hub.facebook && <Link href={hub.facebook.startsWith("http") ? hub.facebook : `https://${hub.facebook}`}>Facebook ↗</Link>}
          </div>

          {hub.references.length > 0 && (
            <div className="mt-5 border-t-2 border-[#20140d22] pt-3">
              <h3 className="mb-2 text-[13px] uppercase tracking-wide opacity-70" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>References</h3>
              <ul className="space-y-1 text-[13px]">
                {hub.references.map(([label, url], i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1d6fa5] underline">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[8px] border-2 border-[#20140d] bg-white px-[9px] py-[2px] text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{children}</span>;
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[14px] py-[5px] text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{children}</a>;
}
