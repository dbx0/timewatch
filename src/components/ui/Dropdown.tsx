import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Popover } from "./Popover";

export interface DropdownOption<T> {
  value: T;
  label: string;
  color?: string;
  group?: string;
}

interface Props<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  renderValue?: (o: DropdownOption<T> | undefined) => ReactNode;
  className?: string;
  ariaLabel?: string;
}

function Dot({ color }: { color?: string }) {
  return color ? <i className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: color }} /> : null;
}

export function Dropdown<T extends string | number>({ value, options, onChange, renderValue, className = "", ariaLabel }: Props<T>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const selIdx = options.findIndex((o) => o.value === value);
  const [active, setActive] = useState(Math.max(0, selIdx));
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const sel = options[selIdx];

  const openList = () => {
    setActive(Math.max(0, selIdx));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    anchor?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };

  useEffect(() => {
    if (open) listRef.current?.focus();
  });

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openList();
          }
        }}
        className={`inline-flex max-w-full cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-[9px] bg-raise px-2.5 py-1.5 text-left text-text outline-none transition hover:bg-raise2 focus-visible:ring-2 focus-visible:ring-accent2 ${className}`}
      >
        {renderValue ? (
          renderValue(sel)
        ) : (
          <>
            <Dot color={sel?.color} />
            <span className="min-w-0 truncate">{sel?.label}</span>
          </>
        )}
        <span aria-hidden className="text-[10px] text-dim">▾</span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="max-h-64 min-w-40 overflow-auto outline-none"
        >
          {options.map((o, i) => (
            <div key={String(o.value)}>
              {o.group && o.group !== options[i - 1]?.group && (
                <div className="px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-wide text-dim">{o.group}</div>
              )}
              <div
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-text ${
                  i === active ? "bg-raise2" : ""
                } ${o.value === value ? "font-semibold" : ""}`}
              >
                <Dot color={o.color} />
                <span className="flex-1 whitespace-nowrap">{o.label}</span>
                {o.value === value && <span aria-hidden className="text-accent2">✓</span>}
              </div>
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
