// lib/season.ts
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Derive the set of calendar months (1–12) a hub is active from its free-text
 * `season`. Ranges expand inclusively and wrap across the year end. Returns [] when
 * nothing parseable is found — callers treat [] as "flexible / always show".
 */
export function parseMonths(season: string): number[] {
  const s = (season || "").toLowerCase();
  if (!s.trim()) return [];
  if (/year[\s-]*round|all year/.test(s)) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g;
  const found: { mon: number; end: number; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found.push({ mon: MONTHS[m[1]], idx: m.index, end: re.lastIndex });
  }
  if (found.length === 0) return [];

  const result = new Set<number>();
  for (let i = 0; i < found.length; i++) {
    result.add(found[i].mon);
    if (i < found.length - 1) {
      const between = s.slice(found[i].end, found[i + 1].idx);
      if (/[-–—]|\bto\b|\bthrough\b|\buntil\b|\btill\b|\bthru\b/.test(between)) {
        let cur = found[i].mon;
        const to = found[i + 1].mon;
        while (cur !== to) {
          cur = (cur % 12) + 1;
          result.add(cur);
        }
      }
    }
  }
  return [...result].sort((a, b) => a - b);
}
