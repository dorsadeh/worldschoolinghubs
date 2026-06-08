import type { Hub } from "./hub";

/** Columns mirror the source spreadsheet so an export round-trips cleanly. */
const COLUMNS: { header: string; value: (h: Hub) => string | number | boolean | null | undefined }[] = [
  { header: "Name", value: (h) => h.name },
  { header: "Host", value: (h) => h.host },
  { header: "Type", value: (h) => h.type },
  { header: "Status", value: (h) => h.status },
  { header: "Country", value: (h) => h.location.country },
  { header: "Region", value: (h) => h.location.region },
  { header: "City", value: (h) => h.location.city },
  { header: "Lat", value: (h) => h.location.lat ?? "" },
  { header: "Lng", value: (h) => h.location.lng ?? "" },
  { header: "Online", value: (h) => h.location.online },
  { header: "Dates", value: (h) => h.schedule.note ?? h.schedule.recurring },
  { header: "Ages", value: (h) => h.ages.note ?? (h.ages.min != null ? `${h.ages.min}-${h.ages.max ?? ""}` : "") },
  { header: "Price", value: (h) => h.price },
  { header: "Length", value: (h) => h.length },
  { header: "Audience", value: (h) => h.audience },
  { header: "Educational", value: (h) => h.educational },
  { header: "Website", value: (h) => h.links.website },
  { header: "Facebook", value: (h) => h.links.facebook },
  { header: "Instagram", value: (h) => h.links.instagram },
  { header: "Verified", value: (h) => h.verified },
  { header: "Sources", value: (h) => h.sources.map((s) => s.name).join("; ") },
  { header: "Tags", value: (h) => h.tags.join(", ") },
];

/** RFC-4180 cell escaping: wrap in quotes and double embedded quotes when needed. */
function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise hubs to a CSV string (header row + one row per hub). */
export function hubsToCsv(hubs: Hub[]): string {
  const header = COLUMNS.map((c) => c.header).join(",");
  const rows = hubs.map((h) => COLUMNS.map((c) => escapeCell(c.value(h))).join(","));
  return [header, ...rows].join("\n") + "\n";
}
