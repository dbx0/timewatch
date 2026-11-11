import { ptBR } from "../i18n/pt-BR";

/** Decimal hours with comma, half-up to 2 decimals, trimmed. Mirrors Rust `fmt_hours`; 0 gives "". */
export function dec(ms: number): string {
  if (ms === 0) return "";
  const hundredths = Math.floor((Math.abs(ms) * 100 + 1_800_000) / 3_600_000);
  const sign = ms < 0 && hundredths > 0 ? "-" : "";
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return `${sign}${whole}`;
  if (frac % 10 === 0) return `${sign}${whole},${frac / 10}`;
  return `${sign}${whole},${String(frac).padStart(2, "0")}`;
}

export function dur(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Accepts a Date or a "YYYY-MM-DD" string. */
export function dayLabel(date: Date | string): string {
  let d: number;
  let m: number;
  if (typeof date === "string") {
    const [, mm, dd] = date.split("-").map(Number);
    m = mm - 1;
    d = dd;
  } else {
    m = date.getMonth();
    d = date.getDate();
  }
  return `${d} ${ptBR.monthsShort[m]}`;
}

/** 0 = Monday. */
export function weekdayShort(i: number): string {
  return ptBR.weekdaysShort[i];
}

/** Local wall-clock "HH:MM" of an epoch ms. */
export function hm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Nearest multiple of `roundingMin` minutes, halves round up. 0 = exact. Mirrors Rust `round_ms`. */
export function roundMs(ms: number, roundingMin: number): number {
  if (roundingMin === 0) return ms;
  const step = roundingMin * 60_000;
  return Math.floor((ms + step / 2) / step) * step;
}
