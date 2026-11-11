import { ptBR } from "../../i18n/pt-BR";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
}

const fmt = (v: number) => String(v).replace(".", ",");

/** Seven daily-target steppers (Mon..Sun) plus Mon-Fri presets. Reused by onboarding. */
export function JornadaEditor({ value, onChange }: Props) {
  const preset = (h: number) => onChange([h, h, h, h, h, 0, 0]);
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[8, 6, 4].map((h) => (
          <Button key={h} size="sm" onClick={() => preset(h)}>{ptBR.settings.preset(h)}</Button>
        ))}
      </div>
      {/* 4 + 3 regular grid: fits the 640px onboarding and the 780px settings windows. */}
      <div data-testid="jornada-days" className="mt-3 grid max-w-[520px] grid-cols-4 gap-2">
        {ptBR.weekdaysShort.map((d, i) => (
          <div key={d} data-testid="jornada-day" className="min-w-0 rounded-xl bg-raise p-2 text-center">
            <div className="mb-1.5 text-xs text-mute">{d}</div>
            <Stepper
              compact
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
