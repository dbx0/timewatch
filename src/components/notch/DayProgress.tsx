import { useT } from "../../i18n";
import { dec, dur } from "../../lib/format";

/** Today's bar: normal time in accent, overtime in accent2. */
export function DayProgress({ todayMs, jornadaMs }: { todayMs: number; jornadaMs: number }) {
  const L = useT();
  let normal: number;
  let extra: number;
  if (jornadaMs <= 0) {
    normal = 0;
    extra = todayMs > 0 ? 100 : 0;
  } else {
    const total = Math.max(jornadaMs, todayMs);
    normal = (Math.min(todayMs, jornadaMs) / total) * 100;
    extra = (Math.max(0, todayMs - jornadaMs) / total) * 100;
  }
  return (
    <div className="my-3">
      <div className="flex h-[5px] overflow-hidden rounded-full bg-raise2">
        <div className="h-full bg-accent" style={{ width: `${normal}%` }} />
        <div className="h-full bg-accent2" style={{ width: `${extra}%` }} />
      </div>
      <div className="mt-[5px] flex justify-between text-xs text-mute">
        <span>{L.notch.today(dur(todayMs))}</span>
        <span>{jornadaMs > 0 ? L.notch.jornada(dec(jornadaMs)) : L.notch.noJornada}</span>
      </div>
    </div>
  );
}
