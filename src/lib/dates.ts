import type { IsoDate, Ms, WeekStart } from "./types";

// Date-only math in local time; never converts through UTC.
const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(day: IsoDate): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: IsoDate, n: number): IsoDate {
  const d = parseIso(day);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** 0 = Monday. */
export function weekdayIndex(day: IsoDate): number {
  return (parseIso(day).getDay() + 6) % 7;
}

export function mondayOf(day: IsoDate): IsoDate {
  return addDays(day, -weekdayIndex(day));
}

/** Monday-based weekday indexes (see `weekdayIndex`) in display order for `start`. */
export function weekOrder(start: WeekStart | undefined): number[] {
  const first = start === "saturday" ? 5 : 0;
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}

/** First day of the week containing `day`. */
export function weekStartOf(day: IsoDate, start: WeekStart | undefined): IsoDate {
  return addDays(day, -weekOrder(start).indexOf(weekdayIndex(day)));
}

/** Epoch ms of local `HH:MM` on `day`. */
export function atLocal(day: IsoDate, hhmm: string): Ms {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
