import { ptBR } from "../../i18n/pt-BR";

interface Props {
  value: number;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export function Stepper({ value, step, min, max, format, onChange }: Props) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const btn = "w-[30px] cursor-pointer select-none py-1.5 text-center text-base text-mute outline-none hover:bg-raise2 hover:text-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent2 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div
      role="group"
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); set(value + step); }
        else if (e.key === "ArrowDown") { e.preventDefault(); set(value - step); }
      }}
      className="inline-flex items-center overflow-hidden rounded-[10px] bg-raise"
    >
      <button type="button" aria-label={ptBR.ui.decrease} disabled={value <= min} onClick={() => set(value - step)} className={btn}>−</button>
      <b role="spinbutton" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} className="min-w-[52px] text-center font-medium tabular-nums text-text">
        {format ? format(value) : value}
      </b>
      <button type="button" aria-label={ptBR.ui.increase} disabled={value >= max} onClick={() => set(value + step)} className={btn}>+</button>
    </div>
  );
}
