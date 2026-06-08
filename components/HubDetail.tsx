"use client";

import { TYPE_META, type Hub } from "@/lib/hub";

interface HubDetailProps {
  hub: Hub;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-700 dark:text-zinc-200">{value}</span>
    </div>
  );
}

function locationLine(hub: Hub): string {
  if (hub.location.online) return "Online";
  const parts = [hub.location.city, hub.location.region, hub.location.country].filter(Boolean);
  return [parts.join(", "), hub.location.note].filter(Boolean).join(" — ") || "Location TBD";
}

export default function HubDetail({ hub, onClose }: HubDetailProps) {
  const meta = TYPE_META[hub.type];
  const links = Object.entries(hub.links).filter(([, v]) => v) as [string, string][];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex flex-col gap-1">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
          <h2 className="text-lg font-semibold leading-tight text-zinc-900 dark:text-zinc-50">{hub.name}</h2>
          {hub.host && <span className="text-sm text-zinc-500">Hosted by {hub.host}</span>}
          {!hub.verified && (
            <span className="text-xs text-amber-600 dark:text-amber-400">⚠ Unverified — sourced from listings, not yet confirmed</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <Field label="Location" value={locationLine(hub)} />
        <Field label="Dates" value={hub.schedule.note ?? hub.schedule.recurring} />
        <Field label="Ages" value={hub.ages.note ?? (hub.ages.min != null ? `${hub.ages.min}–${hub.ages.max ?? "?"}` : undefined)} />
        <Field label="Length" value={hub.length} />
        <Field label="Price" value={hub.price} />
        <Field label="For" value={hub.audience} />
        <Field label="Educational approach" value={hub.educational} />
        <Field label="About" value={hub.description} />
        <Field label="Safety / notes" value={hub.safety} />
        <Field label="Reviews" value={hub.reviews} />

        {links.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Links</span>
            <div className="flex flex-wrap gap-2">
              {links.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  {key}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Sources</span>
          <ul className="flex flex-col gap-1">
            {hub.sources.map((s, i) => (
              <li key={i} className="text-xs text-zinc-500">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
                <span className="text-zinc-400"> · captured {s.retrieved}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
