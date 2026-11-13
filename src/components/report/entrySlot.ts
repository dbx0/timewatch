import { addDays, atLocal } from "../../lib/dates";
import type { IsoDate, Ms } from "../../lib/types";

const MIN = 60_000;
const HOUR = 3_600_000;

export interface Busy {
  start: Ms;
  end: Ms;
  /** A running entry is busy until now (its end moves). */
  running?: boolean;
}

/**
 * Where "Add entry" puts a new one-hour entry on `day`, or null when there is no room.
 *
 * The backend rejects entries that end in the future, so today is capped at `now`. Preferred spot:
 * right after the last entry (09:00 on an empty day), up to an hour. If that has no room (the
 * clock is running, or the last entry ends now), the latest free gap of at least a minute is used:
 * the hour before the first entry for the gap that opens the day, otherwise the start of the gap.
 * Future days never get one.
 */
export function entrySlot(day: IsoDate, today: IsoDate, now: Ms, busy: Busy[]): [Ms, Ms] | null {
  if (day > today) return null;
  const dayStart = atLocal(day, "00:00");
  const dayEnd = atLocal(addDays(day, 1), "00:00") - MIN;
  const limit = day === today ? Math.min(Math.floor(now / MIN) * MIN, dayEnd) : dayEnd;

  const spans = busy
    .map((b) => ({ start: b.start, end: b.running ? Infinity : b.end }))
    .sort((a, b) => a.start - b.start);
  const gaps: [Ms, Ms][] = [];
  let cursor = dayStart;
  for (const s of spans) {
    if (cursor >= limit) break;
    if (s.start > cursor) gaps.push([cursor, Math.min(s.start, limit)]);
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < limit) gaps.push([cursor, limit]);
  const free = gaps.filter(([a, b]) => b - a >= MIN);

  const lastEnd = busy.length ? Math.max(...spans.map((s) => s.end)) : atLocal(day, "09:00");
  const home = free.find(([a, b]) => a <= lastEnd && lastEnd < b);
  if (home && Math.min(lastEnd + HOUR, home[1]) - lastEnd >= MIN) return [lastEnd, Math.min(lastEnd + HOUR, home[1])];

  const g = free[free.length - 1];
  if (!g) return null;
  const [a, b] = g;
  return a === dayStart ? [Math.max(a, b - HOUR), b] : [a, Math.min(a + HOUR, b)];
}
