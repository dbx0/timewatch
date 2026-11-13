import { useT } from "../../i18n";

interface Props {
  value: number;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Fills its container: 28px buttons, value centered in the remaining space. */
  compact?: boolean;
  /** Accessible name of the value (e.g. the weekday, or the setting's title). */
  ariaLabel?: string;
}

export function Stepper({ value, step, min, max, format, onChange, compact = false, ariaLabel }: Props) {
  const L = useT();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const base =
    "flex-none cursor-pointer select-none text-center text-mute outline-none hover:bg-raise2 hover:text-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent2 disabled:pointer-events-none disabled:opacity-40";
  const btn = compact ? `${base} h-7 w-7 text-[15px] leading-7` : `${base} w-[30px] py-1.5 text-base`;
  const shown = format ? format(value) : String(value);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); set(value + step); }
        else if (e.key === "ArrowDown") { e.preventDefault(); set(value - step); }
        else if (e.key === "Home" && e.target === e.currentTarget.querySelector("[role=spinbutton]")) { e.preventDefault(); set(min); }
        else if (e.key === "End" && e.target === e.currentTarget.querySelector("[role=spinbutton]")) { e.preventDefault(); set(max); }
      }}
      className={`items-center overflow-hidden ${compact ? "flex w-full min-w-0 rounded-lg bg-win" : "inline-flex rounded-[10px] bg-raise"}`}
    >
      <button type="button" tabIndex={-1} aria-label={L.ui.decrease} disabled={value <= min} onClick={() => set(value - step)} className={btn}>−</button>
      <b
        role="spinbutton"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={shown}
        className={`rounded-md text-center font-medium tabular-nums text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent2 ${compact ? "min-w-0 flex-1 text-[13px]" : "min-w-[52px]"}`}
      >
        {shown}
      </b>
      <button type="button" tabIndex={-1} aria-label={L.ui.increase} disabled={value >= max} onClick={() => set(value + step)} className={btn}>+</button>
    </div>
  );
}
