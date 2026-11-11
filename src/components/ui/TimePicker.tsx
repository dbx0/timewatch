import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "./Popover";
import { useT } from "../../i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Minute granularity of the list (default 5; 1 where precision matters). */
  minuteStep?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function parse(v: string): [number, number] {
  const [h, m] = v.split(":").map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

/** Typed digits on the trigger: "9" / "13" (hour), "930" (9:30), "1330" (13:30). */
function parseTyped(d: string): [number, number] | null {
  if (!/^\d{1,4}$/.test(d)) return null;
  const [h, m] =
    d.length <= 2 ? [Number(d), 0] : d.length === 3 ? [Number(d[0]), Number(d.slice(1))] : [Number(d.slice(0, 2)), Number(d.slice(2))];
  return h < 24 && m < 60 ? [h, m] : null;
}

/**
 * `HH:MM` pill. Click opens a small two-column list: picking the hour only marks it,
 * picking the minute confirms and closes. Enter confirms, Esc cancels, arrows move.
 * When focused, typing digits sets the time directly.
 */
export function TimePicker({ value, onChange, className = "", minuteStep = 5 }: Props) {
  const L = useT();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [[h, m], setHM] = useState<[number, number]>(parse(value));
  const [col, setCol] = useState<0 | 1>(0);
  const [typed, setTyped] = useState("");
  const hRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const minutes = useMemo(() => {
    const step = Math.max(1, Math.min(30, Math.floor(minuteStep)));
    const list = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
    // An off-step current minute (e.g. 09:32 recorded exactly) stays visible and selected.
    if (!list.includes(m)) list.push(m);
    return list.sort((a, b) => a - b);
  }, [minuteStep, m]);

  const openPicker = () => {
    setTyped("");
    setHM(parse(value));
    setCol(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    anchor?.focus();
  };
  const commit = (hh: number, mm: number) => {
    onChange(`${pad(hh)}:${pad(mm)}`);
    close();
  };

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Keep the selected item centered in each column.
  useEffect(() => {
    if (!open) return;
    for (const c of [hRef.current, mRef.current]) {
      const on = c?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (c && on) c.scrollTop = on.offsetTop - c.clientHeight / 2 + on.offsetHeight / 2;
    }
  }, [open, h, m]);

  const onPanelKey = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta) {
      e.preventDefault();
      if (col === 0) setHM([(h + delta + 24) % 24, m]);
      else {
        const i = minutes.indexOf(m);
        setHM([h, minutes[(i + delta + minutes.length) % minutes.length]]);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setCol(0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setCol(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(h, m);
    }
  };

  const applyTyped = (d: string) => {
    setTyped("");
    const t = parseTyped(d);
    if (t) onChange(`${pad(t[0])}:${pad(t[1])}`);
  };
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (open) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const d = typed + e.key;
      if (d.length === 4) applyTyped(d);
      else setTyped(d);
    } else if (typed && e.key === "Enter") {
      e.preventDefault();
      applyTyped(typed);
    } else if (typed && e.key === "Backspace") {
      e.preventDefault();
      setTyped(typed.slice(0, -1));
    } else if (typed && e.key === "Escape") {
      e.preventDefault();
      setTyped("");
    }
  };

  const item = (n: number, on: boolean, active: boolean, label: string, pick: () => void) => (
    <div
      key={n}
      role="option"
      aria-selected={on}
      aria-label={label}
      onClick={pick}
      className={`h-7 flex-none cursor-pointer rounded-md text-center text-[13px] leading-7 tabular-nums ${
        on ? `bg-accent/15 font-semibold text-accent2 ${active ? "ring-1 ring-inset ring-accent/50" : ""}` : "text-text hover:bg-raise2"
      }`}
    >
      {pad(n)}
    </div>
  );
  const column = "flex h-[180px] w-[72px] flex-col gap-px overflow-y-auto overscroll-contain [scrollbar-width:none]";

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={onTriggerKey}
        onBlur={() => setTyped("")}
        className={`inline-flex cursor-pointer select-none items-center rounded-[9px] bg-raise px-2.5 py-1.5 tabular-nums outline-none transition hover:bg-raise2 focus-visible:ring-2 focus-visible:ring-accent2 ${
          typed ? "text-accent2" : "text-text"
        } ${className}`}
      >
        {typed || value}
      </button>
      <Popover anchor={anchor} open={open} onClose={close}>
        <div ref={panelRef} data-testid="timepicker-panel" tabIndex={-1} onKeyDown={onPanelKey} className="flex gap-1 outline-none">
          <div ref={hRef} role="listbox" aria-label={L.ui.hour} className={column}>
            {HOURS.map((n) =>
              item(n, n === h, col === 0, `${L.ui.hour} ${pad(n)}`, () => {
                setHM([n, m]);
                setCol(1);
              }),
            )}
          </div>
          <div className="w-px flex-none bg-line" aria-hidden />
          <div ref={mRef} role="listbox" aria-label={L.ui.minute} className={column}>
            {minutes.map((n) => item(n, n === m, col === 1, `${L.ui.minute} ${pad(n)}`, () => commit(h, n)))}
          </div>
        </div>
      </Popover>
    </>
  );
}
