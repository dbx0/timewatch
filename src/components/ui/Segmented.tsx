import { useRef } from "react";

interface Props<T> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, ariaLabel }: Props<T>) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);

  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex gap-0.5 rounded-[10px] bg-raise p-[3px]">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <div
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            role="radio"
            aria-checked={on}
            tabIndex={on || (idx < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
              else if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(o.value); }
            }}
            className={`cursor-pointer select-none whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent2 ${
              on ? "bg-raise2 text-text shadow-[0_1px_3px_rgba(0,0,0,.4)]" : "text-mute hover:text-text"
            }`}
          >
            {o.label}
          </div>
        );
      })}
    </div>
  );
}
