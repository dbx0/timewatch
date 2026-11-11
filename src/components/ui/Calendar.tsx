import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { dayLabel } from "../../lib/format";

interface Props {
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD" */
  selected: string[];
  onToggle: (day: string) => void;
  onMonthChange?: (month: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Calendar({ month, selected, onToggle, onMonthChange }: Props) {
  const L = useT();
  const [shown, setShown] = useState(month);
  useEffect(() => setShown(month), [month]);

  const [y, mo] = shown.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7; // Monday first

  const go = (delta: number) => {
    const d = new Date(y, mo - 1 + delta, 1);
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    setShown(next);
    onMonthChange?.(next);
  };

  const navBtn = "h-7 w-7 cursor-pointer rounded-lg text-mute outline-none hover:bg-raise2 hover:text-text focus-visible:ring-2 focus-visible:ring-accent2";

  return (
    <div className="w-[250px] p-1 text-text">
      <div className="mb-1.5 flex items-center justify-between">
        <button type="button" aria-label={L.ui.prevMonth} onClick={() => go(-1)} className={navBtn}>‹</button>
        <span className="font-medium capitalize">
          {L.monthsLong[mo - 1]} {y}
        </span>
        <button type="button" aria-label={L.ui.nextMonth} onClick={() => go(1)} className={navBtn}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {L.weekdaysInitial.map((w, i) => (
          <div key={i} className="py-1 text-dim">{w}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = `${y}-${pad(mo)}-${pad(i + 1)}`;
          const on = selected.includes(iso);
          return (
            <button
              key={iso}
              type="button"
              aria-label={dayLabel(iso)}
              aria-pressed={on}
              onClick={() => onToggle(iso)}
              className={`cursor-pointer rounded-[7px] py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent2 ${
                on ? "bg-accent font-semibold text-white" : "hover:bg-raise2"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
