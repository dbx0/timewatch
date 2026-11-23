import { useT } from "../../i18n";
import { weekOrder } from "../../lib/dates";
import { decimalSep } from "../../lib/format";
import type { WeekStart } from "../../lib/types";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";

interface Props {
  /** Mon..Sun, whatever the display order. */
  value: number[];
  /** Display order; Monday first when omitted (onboarding). */
  weekStart?: WeekStart;
  onChange: (next: number[]) => void;
}

const fmt = (v: number) => String(v).replace(".", decimalSep());

/** Seven daily-target steppers (Mon..Sun) plus Mon-Fri presets. Reused by onboarding. */
export function JornadaEditor({ value, weekStart, onChange }: Props) {
  const L = useT();
  const preset = (h: number) => onChange([h, h, h, h, h, 0, 0]);
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[8, 6, 4].map((h) => (
          <Button key={h} size="sm" onClick={() => preset(h)}>{L.settings.preset(h)}</Button>
        ))}
      </div>
      {/* 4 + 3 regular grid: fits the 640px onboarding and the 780px settings windows. */}
      <div data-testid="jornada-days" className="mt-3 grid max-w-[520px] grid-cols-4 gap-2">
        {weekOrder(weekStart).map((i) => (
          <div key={i} data-testid="jornada-day" className="min-w-0 rounded-xl bg-raise p-2 text-center">
            <div className="mb-1.5 text-xs text-mute">{L.weekdaysShort[i]}</div>
            <Stepper
              compact
              ariaLabel={L.report.weekdaysLong[i]}
              value={value[i] ?? 0}
              step={0.5}
              min={0}
              max={24}
              format={fmt}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
