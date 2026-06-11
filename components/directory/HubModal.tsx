// components/directory/HubModal.tsx
"use client";

import {
  CATEGORY_META, COST_META, hubImage,
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/55 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-surface text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-2xl">
          {hubImage(hub) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hubImage(hub) as string} alt={hub.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `color-mix(in srgb, ${meta.color} 14%, #eef0ec)` }} />
          )}
          <button type="button" onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-[15px] text-ink shadow-sm">✕</button>
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
        </div>

        <div className="p-5">
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">{hub.name}</h2>
          {hub.host && <p className="mt-1 text-[14px] font-medium text-muted">Hosted by {hub.host}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {[hub.region, hub.country].filter(Boolean).join(", ") && <Tag>{[hub.region, hub.country].filter(Boolean).join(", ")}</Tag>}
            {hub.season && <Tag>{hub.season}</Tag>}
            <Tag>{COST_META[hub.costBucket]}{hub.price ? ` · ${hub.price}` : ""}</Tag>
            {hub.participation && <Tag>{hub.participation === "dropoff" ? "Drop-off" : "Family"}</Tag>}
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
              onClick={() => openFeedback({ hubId: hub.id, hubName: hub.name, type: "outdated" })}
              className="text-[13px] font-semibold text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              Flag an error
            </button>
          </div>

          {hub.references.length > 0 && (
            <div className="mt-5 border-t border-line pt-3">
              <h3 className={SECTION_TITLE}>References</h3>
              <ul className="space-y-1 text-[13px]">
                {hub.references.map(([label, url], i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{label}</a>
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
  return <span className="rounded-md border border-line bg-surface px-2 py-[3px] text-[12px] font-semibold text-ink">{children}</span>;
}

const SECTION_TITLE = "mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-faint";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-3">
      <h3 className={SECTION_TITLE}>{title}</h3>
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
        <Section title="Upcoming events">
          <ul className="space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="rounded-lg border border-line bg-bg px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold">{ev.title}</span>
                  <span className="shrink-0 text-[12px] font-semibold text-accent">{eventDates(ev)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] opacity-80">
                  {ev.type && <span>{ev.type}</span>}
                  {ev.ageFocus && <span>· {ev.ageFocus}</span>}
                  {ev.price && <span>· {ev.price}</span>}
                  {ev.url && <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">details ↗</a>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t && (t.bestWindow || t.avoidWindow || t.note) && (
        <Section title="When to go">
          <div className="flex flex-col gap-2 text-[14px]">
            {t.bestWindow && (
              <div className="rounded-lg bg-accent-soft px-3 py-1.5 text-ink">
                <span className="font-semibold">Best:</span> {t.bestWindow}
              </div>
            )}
            {t.avoidWindow && (
              <div className="rounded-lg bg-[#fef3e2] px-3 py-1.5 text-ink">
                <span className="font-semibold">Avoid:</span> {t.avoidWindow}
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
              className="mt-3 inline-block rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white">Book / enroll ↗</a>
          )}
        </Section>
      )}

      {flags.length > 0 && (
        <Section title="Needs review">
          <ul className="space-y-1.5 text-[13px]">
            {flags.map((f, i) => (
              <li key={i} className="rounded-lg bg-[#fef9e7] px-3 py-1.5">
                <span className="font-semibold">{f.field}:</span>{" "}
                {f.currentValue && <span className="line-through opacity-60">{f.currentValue}</span>}
                {f.suggestedValue && <span> → {f.suggestedValue}</span>}
                {f.note && <span className="opacity-80"> — {f.note}</span>}
                {f.evidence && <> <a href={f.evidence} target="_blank" rel="noopener noreferrer" className="text-accent underline">source ↗</a></>}
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
  return <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent hover:border-faint">{children}</a>;
}
