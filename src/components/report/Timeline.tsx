import { useT } from "../../i18n";
import { atLocal } from "../../lib/dates";
import { hm } from "../../lib/format";
import type { IsoDate, Lunch, Project, Seg } from "../../lib/types";

const H = 3_600_000;

interface Props {
  day: IsoDate;
  segments: Seg[];
  lunch: Lunch | null;
  projects: Project[];
  /** Epoch ms of "now" when `day` is today, else null. */
  now: number | null;
}

export function Timeline({ day, segments, lunch, projects, now }: Props) {
  const t = useT().report;
  const dayStart = atLocal(day, "00:00");
  const hourOf = (ms: number) => (ms - dayStart) / H;
  let lo = 7;
  let hi = 19;
  for (const s of segments) {
    lo = Math.min(lo, Math.floor(hourOf(s.start)));
    hi = Math.max(hi, Math.ceil(hourOf(s.end)));
  }
  lo = Math.max(0, lo);
  hi = Math.min(24, hi);
  const base = dayStart + lo * H;
  const span = (hi - lo) * H;
  const pct = (ms: number) => `${(((ms - base) / span) * 100).toFixed(2)}%`;
  const width = (a: number, b: number) => `${(((b - a) / span) * 100).toFixed(2)}%`;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const ticks: number[] = [];
  for (let h = lo; h <= hi; h += 2) ticks.push(h);

  return (
    <div data-testid="timeline" className="relative mb-[22px] mt-1.5 h-[46px] rounded-[10px] bg-raise">
      {segments.map((s) => {
        const p = byId.get(s.projectId);
        return (
          <div
            key={`${s.entryId}-${s.start}`}
            className="absolute bottom-2 top-2 min-w-[2px] rounded-md"
            style={{ left: pct(s.start), width: width(s.start, s.end), background: p?.color ?? "#5d5d68" }}
            title={`${p?.name ?? ""} ${hm(s.start)}–${hm(s.end)}`}
          />
        );
      })}
      {lunch && (
        <div
          data-testid="timeline-lunch"
          className="absolute bottom-2 top-2 min-w-[2px] rounded-md bg-[repeating-linear-gradient(45deg,#2c2c35_0_6px,#23232b_6px_12px)]"
          style={{ left: pct(lunch.start), width: width(lunch.start, lunch.end) }}
          title={t.lunch}
        />
      )}
      {ticks.map((h) => (
        <span
          key={h}
          className="absolute -bottom-[18px] -translate-x-1/2 text-[11px] text-dim"
          style={{ left: `${(((h - lo) / (hi - lo)) * 100).toFixed(2)}%` }}
        >
          {String(h).padStart(2, "0")}h
        </span>
      ))}
      {now !== null && now >= base && now <= base + span && (
        <div data-testid="timeline-now" className="absolute bottom-0.5 top-0.5 w-0.5 rounded-sm bg-white" style={{ left: pct(now) }} />
      )}
    </div>
  );
}
