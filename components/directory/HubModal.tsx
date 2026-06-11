// components/directory/HubModal.tsx
"use client";

import {
  CATEGORY_META, COST_META,
  type DirectoryHub, type HubEvent,
} from "@/lib/directory";
import { useFeedback } from "@/components/feedback/FeedbackContext";

/** "2026-09-07" → "7 Sep 2026"; passes through anything non-ISO untouched. */
function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

function eventDates(ev: HubEvent): string {
  const a = fmtDate(ev.startDate), b = fmtDate(ev.endDate);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || "Dates TBD";
}

export default function HubModal({ hub, onClose }: { hub: DirectoryHub; onClose: () => void }) {
  const meta = CATEGORY_META[hub.category];
  const { open: openFeedback } = useFeedback();
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#20140d99] p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-[22px] border-[2.5px] border-[#20140d] bg-[#fffaf3] shadow-[8px_10px_0_#20140d]"
        style={{ fontFamily: "var(--font-body)", color: "#20140d" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-[19px]">
          {hub.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hub.image} alt={hub.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: meta.color }} />
          )}
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
          <p className="mt-1.5 text-[11px] leading-snug opacity-50">
            Prices are community-reported estimates — verify with the provider.
          </p>

          {hub.summary && <p className="mt-4 text-[15px] leading-relaxed">{hub.summary}</p>}

          <Enrichment hub={hub} />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {hub.website && <Link href={hub.website.startsWith("http") ? hub.website : `https://${hub.website}`}>Website ↗</Link>}
            {hub.facebook && <Link href={hub.facebook.startsWith("http") ? hub.facebook : `https://${hub.facebook}`}>Facebook ↗</Link>}
            <button
              type="button"
              onClick={() => openFeedback({ hubId: hub.id, hubName: hub.name, type: "price" })}
              className="text-[13px] font-semibold text-[#6b4e3d] underline decoration-dotted underline-offset-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ⚑ Flag an error
            </button>
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

const SECTION_TITLE = "mb-2 text-[13px] uppercase tracking-wide opacity-70";
const sectionTitleStyle = { fontFamily: "var(--font-display)", fontWeight: 700 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t-2 border-[#20140d22] pt-3">
      <h3 className={SECTION_TITLE} style={sectionTitleStyle}>{title}</h3>
      {children}
    </div>
  );
}

/** A labelled fact row; renders nothing when the value is empty. */
function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{label}</span>
      <span className="text-[14px] leading-snug">{value}</span>
    </div>
  );
}

function Enrichment({ hub }: { hub: DirectoryHub }) {
  const e = hub.enrichment;
  if (!e) return null;

  const events = e.events ?? [];
  const t = e.timing;
  const loc = e.exactLocation;
  const x = e.extras;
  const flags = e.flags ?? [];
  const locLine = loc
    ? loc.address || [loc.locality, loc.region, loc.country].filter(Boolean).join(", ")
    : null;

  return (
    <>
      {events.length > 0 && (
        <Section title="📅 Upcoming events">
          <ul className="space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="rounded-[12px] border-2 border-[#20140d] bg-white px-3 py-2 shadow-[3px_3px_0_#20140d]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{ev.title}</span>
                  <span className="shrink-0 text-[12px] font-semibold text-[#1d6fa5]">{eventDates(ev)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] opacity-80">
                  {ev.type && <span>{ev.type}</span>}
                  {ev.ageFocus && <span>· {ev.ageFocus}</span>}
                  {ev.price && <span>· {ev.price}</span>}
                  {ev.url && <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-[#1d6fa5] underline">details ↗</a>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t && (t.bestWindow || t.avoidWindow || t.note) && (
        <Section title="🗓️ When to go">
          <div className="flex flex-col gap-2 text-[14px]">
            {t.bestWindow && (
              <div className="rounded-[10px] border-2 border-[#20140d] bg-[#caffbf] px-3 py-1.5">
                <span className="font-semibold">✅ Best:</span> {t.bestWindow}
              </div>
            )}
            {t.avoidWindow && (
              <div className="rounded-[10px] border-2 border-[#20140d] bg-[#ffd6a5] px-3 py-1.5">
                <span className="font-semibold">⚠️ Avoid:</span> {t.avoidWindow}
              </div>
            )}
            {t.note && <p className="text-[13px] leading-relaxed opacity-80">{t.note}</p>}
          </div>
        </Section>
      )}

      {(e.ageRange?.value || e.priceRange?.value || locLine || x) && (
        <Section title="Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="Ages" value={e.ageRange?.value} />
            <Detail label="Price" value={e.priceRange?.value} />
            <Detail label="Exact location" value={locLine} />
            <Detail label="Language" value={x?.languageOfInstruction} />
            <Detail label="Community size" value={x?.communitySize} />
            <Detail label="Nationality skew" value={x?.nationalitySkew} />
            <Detail label="Legal / visa risk" value={x?.legalVisaRisk} />
            <Detail label="Notes" value={x?.otherNotes} />
          </div>
          {x?.bookingUrl && (
            <a href={x.bookingUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[14px] py-[5px] text-[13px] font-semibold"
              style={{ fontFamily: "var(--font-display)" }}>Book / enroll ↗</a>
          )}
        </Section>
      )}

      {flags.length > 0 && (
        <Section title="⚠️ Needs review">
          <ul className="space-y-1.5 text-[13px]">
            {flags.map((f, i) => (
              <li key={i} className="rounded-[10px] border-2 border-[#20140d] bg-[#fff3bf] px-3 py-1.5">
                <span className="font-semibold">{f.field}:</span>{" "}
                {f.currentValue && <span className="line-through opacity-60">{f.currentValue}</span>}
                {f.suggestedValue && <span> → {f.suggestedValue}</span>}
                {f.note && <span className="opacity-80"> — {f.note}</span>}
                {f.evidence && <> <a href={f.evidence} target="_blank" rel="noopener noreferrer" className="text-[#1d6fa5] underline">source ↗</a></>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(e.researchStatus || (e.sources && e.sources.length > 0)) && (
        <p className="mt-3 text-[11px] uppercase tracking-wide opacity-40">
          Research: {e.researchStatus ?? "—"}
          {e.sources && e.sources.length > 0 && ` · ${e.sources.join(", ")}`}
        </p>
      )}
    </>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[14px] py-[5px] text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{children}</a>;
}
