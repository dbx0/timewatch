import { useEffect, useRef, useState } from "react";
import { Popover } from "./Popover";
import { Button } from "./Button";
import { ptBR } from "../../i18n/pt-BR";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function parse(v: string): [number, number] {
  const [h, m] = v.split(":").map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

export function TimePicker({ value, onChange, className = "" }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [[h, m], setHM] = useState<[number, number]>(parse(value));
  const [col, setCol] = useState<0 | 1>(0);
  const hRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    setHM(parse(value));
    setCol(0);
    setOpen(true);
  };
  const confirm = () => {
    onChange(`${pad(h)}:${pad(m)}`);
    setOpen(false);
    anchor?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  // keep the selected item centered in each column
  useEffect(() => {
    if (!open) return;
    for (const c of [hRef.current, mRef.current]) {
      const on = c?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (c && on) c.scrollTop = on.offsetTop - c.clientHeight / 2 + on.offsetHeight / 2;
    }
  }, [open, h, m]);

  const onKey = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta) {
      e.preventDefault();
      if (col === 0) setHM([(h + delta + 24) % 24, m]);
      else setHM([h, (m + delta + 60) % 60]);
    } else if (e.key === "ArrowLeft") setCol(0);
    else if (e.key === "ArrowRight") setCol(1);
    else if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    }
  };

  const item = (n: number, on: boolean, label: string, pick: () => void) => (
    <div
      key={n}
      role="option"
      aria-selected={on}
      aria-label={label}
      onClick={pick}
      className={`cursor-pointer rounded-[7px] py-1.5 text-center tabular-nums ${
        on ? "bg-accent font-semibold text-white" : "text-text hover:bg-raise2"
      }`}
    >
      {pad(n)}
    </div>
  );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`inline-flex cursor-pointer select-none items-center rounded-[9px] bg-raise px-2.5 py-1.5 tabular-nums text-text outline-none transition hover:bg-raise2 focus-visible:ring-2 focus-visible:ring-accent2 ${className}`}
      >
        {value}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <div ref={panelRef} tabIndex={-1} onKeyDown={onKey} className="outline-none">
          <div className="flex gap-1">
            <div
              ref={hRef}
              role="listbox"
              aria-label={ptBR.ui.hour}
              className={`relative h-[220px] w-[58px] overflow-auto rounded-lg [scrollbar-width:none] ${col === 0 ? "ring-1 ring-line" : ""}`}
            >
              {HOURS.map((n) => item(n, n === h, `${ptBR.ui.hour} ${pad(n)}`, () => { setHM([n, m]); setCol(1); }))}
            </div>
            <div
              ref={mRef}
              role="listbox"
              aria-label={ptBR.ui.minute}
              className={`relative h-[220px] w-[58px] overflow-auto rounded-lg [scrollbar-width:none] ${col === 1 ? "ring-1 ring-line" : ""}`}
            >
              {MINUTES.map((n) => item(n, n === m, `${ptBR.ui.minute} ${pad(n)}`, () => setHM([h, n])))}
            </div>
          </div>
          <Button variant="primary" size="sm" className="mt-1.5 w-full" onClick={confirm}>
            {ptBR.ui.ok}
          </Button>
        </div>
      </Popover>
    </>
  );
}
