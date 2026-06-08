import type { Hub } from "./hub";

/** Normalise a hub name for fuzzy comparison: lowercase, strip punctuation/words. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(the|hub|worldschool|worldschooling|world|school|schooling|family|families|popup|pop|up|camp|gathering|center|centre|community)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Great-circle distance in km between two coordinates. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface DuplicateWarning {
  a: string; // hub id
  b: string; // hub id
  reason: string;
}

/**
 * Flag pairs of hubs that are probably the same place described by different
 * sources, so a curator can merge them (canonical record + aliases + merged
 * sources) before they pollute the dataset.
 */
export function findDuplicateWarnings(hubs: Hub[]): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const a = hubs[i];
      const b = hubs[j];

      const na = normalizeName(a.name);
      const nb = normalizeName(b.name);
      if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) {
        warnings.push({ a: a.id, b: b.id, reason: `similar name ("${a.name}" ~ "${b.name}")` });
        continue;
      }

      if (
        typeof a.location.lat === "number" &&
        typeof a.location.lng === "number" &&
        typeof b.location.lat === "number" &&
        typeof b.location.lng === "number"
      ) {
        const km = haversineKm(
          a.location.lat,
          a.location.lng,
          b.location.lat,
          b.location.lng,
        );
        if (km < 2 && a.host && b.host && a.host === b.host) {
          warnings.push({
            a: a.id,
            b: b.id,
            reason: `same host (${a.host}) within ${km.toFixed(1)}km`,
          });
        }
      }
    }
  }
  return warnings;
}
