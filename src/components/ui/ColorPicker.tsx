import { useRef } from "react";

/** Project identity colors (dots and swatches only). */
export const PROJECT_PALETTE = [
  "#3ddc84", "#5aa9ff", "#ffb347", "#c08bff", "#ff6b8b", "#4dd6d6",
  "#e6e04f", "#ff8f5a", "#9be15d", "#7c9cff", "#f78fb3", "#b0b0bb",
];

interface Props {
  value: string;
  colors?: string[];
  onChange: (c: string) => void;
}

export function ColorPicker({ value, colors = PROJECT_PALETTE, onChange }: Props) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + colors.length) % colors.length;
    onChange(colors[n]);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" className="grid grid-cols-6 gap-2 p-2">
      {colors.map((c, i) => {
        const on = c === value;
        return (
          <div
            key={c}
            ref={(el) => { refs.current[i] = el; }}
            role="radio"
            aria-checked={on}
            aria-label={c}
            tabIndex={on || (!colors.includes(value) && i === 0) ? 0 : -1}
            onClick={() => onChange(c)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
              else if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(c); }
            }}
            style={{ background: c }}
            className={`h-[22px] w-[22px] cursor-pointer rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent2 ${
              on ? "ring-2 ring-white ring-offset-2 ring-offset-[#18181e]" : ""
            }`}
          />
        );
      })}
    </div>
  );
}
