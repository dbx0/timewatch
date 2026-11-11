import { useState } from "react";
import { useT } from "../../i18n";
import { dayLabel } from "../../lib/format";
import { toIso } from "../../lib/dates";
import { Calendar } from "../ui/Calendar";
import { Popover } from "../ui/Popover";
import { JornadaEditor } from "./JornadaEditor";
import { Row, type SectionProps } from "./Row";

export function WorkdaySection({ settings, update }: SectionProps) {
  const t = useT().settings;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const holidays = [...settings.holidays].sort();
  const toggle = (d: string) =>
    update({ holidays: settings.holidays.includes(d) ? settings.holidays.filter((x) => x !== d) : [...settings.holidays, d] });

  return (
    <>
      <h3 className="mb-1 text-lg font-semibold">{t.workdayTitle}</h3>
      <div className="text-[13px] text-mute">{t.workdayHint}</div>
      <JornadaEditor value={settings.jornadaH} onChange={(v) => update({ jornadaH: v })} />
      <div className="mt-3" />
      <Row title={t.holidays} hint={t.holidaysHint}>
        <button
          ref={setAnchor}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="cursor-pointer select-none whitespace-nowrap rounded-lg bg-raise2 px-2.5 py-1.5 text-[13px] font-medium text-text outline-none transition hover:bg-[#2e2e38] focus-visible:ring-2 focus-visible:ring-accent2"
        >
          {t.markDates}
        </button>
      </Row>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {holidays.length === 0 && <span className="text-xs text-dim">{t.noHolidays}</span>}
        {holidays.map((h) => (
          <button
            key={h}
            type="button"
            aria-label={t.removeHoliday(dayLabel(h))}
            onClick={() => toggle(h)}
            className="cursor-pointer rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent2 outline-none hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-accent2"
          >
            {dayLabel(h)} ✕
          </button>
        ))}
      </div>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <Calendar month={toIso(new Date()).slice(0, 7)} selected={settings.holidays} onToggle={toggle} />
      </Popover>
    </>
  );
}
