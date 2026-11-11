import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../lib/api";
import { addDays, atLocal, errMsg, parseIso, weekdayIndex } from "../../lib/dates";
import { dayLabel, dec, dur, hm, roundMs } from "../../lib/format";
import { ptBR } from "../../i18n/pt-BR";
import type { DayDto, IsoDate, Settings } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { Card, Cards, NavButton } from "./Cards";
import { DeleteButton, EntryRow } from "./EntryRow";
import { Timeline } from "./Timeline";

interface Props {
  day: IsoDate;
  today: IsoDate;
  now: number;
  reloadKey: number;
  onDayChange: (d: IsoDate) => void;
  onBack: () => void;
}

const t = ptBR.report;
const HOUR = 3_600_000;

export function DayView({ day, today, now, reloadKey, onDayChange, onBack }: Props) {
  const [data, setData] = useState<DayDto | null>(null);
  const [settings, setSettings] = useState<Pick<Settings, "lunchMin" | "lunchRef" | "roundingMin"> | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    Promise.all([api.getDay(day), api.getSettings()]).then(
      ([d, s]) => {
        if (id !== seq.current) return;
        setData(d);
        setSettings(s);
      },
      (e) => id === seq.current && toast(errMsg(e)),
    );
  }, [day]);

  useEffect(load, [load, reloadKey]);

  const run = async (op: () => Promise<unknown>, after?: () => void) => {
    try {
      await op();
      after?.();
    } catch (e) {
      toast(errMsg(e));
    }
    load();
  };

  const undo = () => void run(() => api.undo());

  const addEntry = async () => {
    if (!data) return;
    try {
      const snap = await api.getSnapshot();
      const projectId = snap.recents[0]?.project.id ?? data.projects.find((p) => !p.archived)?.id;
      if (projectId === undefined) {
        toast(t.noProject);
        return;
      }
      const last = data.day.segments[data.day.segments.length - 1];
      const start = last ? last.end : atLocal(day, "09:00");
      const dayEnd = atLocal(addDays(day, 1), "00:00") - 60_000;
      await api.addEntry(projectId, start, Math.min(start + HOUR, dayEnd));
    } catch (e) {
      toast(errMsg(e));
    }
    load();
  };

  const calc = data?.day;
  const projects = data?.projects ?? [];
  // Same numbers as the week grid: each project's normal and extra rounded, then summed.
  const rounding = settings?.roundingMin ?? 0;
  const perProject = calc ? Object.values(calc.perProject) : [];
  const extraMs = perProject.reduce((a, p) => a + roundMs(p.extraMs, rounding), 0);
  const totalMs = perProject.reduce((a, p) => a + roundMs(p.normalMs, rounding), 0) + extraMs;
  const hours = (ms: number) => `${dec(ms) || "0"}h`;
  const d = parseIso(day);
  const title = `${t.weekdaysLong[weekdayIndex(day)]}, ${dayLabel(d)}`;
  const ref = settings?.lunchRef.slice(0, 5) ?? "";

  type Item = { t: number; node: React.ReactNode };
  const items: Item[] = [];
  if (calc) {
    for (const seg of calc.segments) {
      items.push({
        t: seg.start,
        node: (
          <EntryRow
            key={`e${seg.entryId}-${seg.start}`}
            day={day}
            seg={seg}
            projects={projects}
            onUpdate={(id, patch) => void run(() => api.updateEntry(id, patch))}
            onNote={(id, note) => void run(() => api.setEntryNote(id, note))}
            onDelete={(id) =>
              void run(
                () => api.deleteEntry(id),
                () => toast(t.deleted, { undo }),
              )
            }
          />
        ),
      });
    }
    if (calc.lunch) {
      const l = calc.lunch;
      items.push({
        t: l.start,
        node: (
          <div key="lunch" className="group flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 hover:bg-[#17171d]">
            <span className="inline-flex rounded-[9px] bg-raise px-2.5 py-1.5 tabular-nums">{hm(l.start)}</span>
            <span className="text-dim">→</span>
            <span className="inline-flex rounded-[9px] bg-raise px-2.5 py-1.5 tabular-nums">{hm(l.end)}</span>
            <span className="ml-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent2">{t.lunch}</span>
            <span className="text-xs text-dim">{t.lunchMarked}</span>
            <span className="ml-auto min-w-[70px] text-right tabular-nums text-mute">{dur(l.end - l.start)}</span>
            <DeleteButton
              label={t.unmarkLunch}
              onClick={() =>
                void run(
                  () => api.unmarkLunch(day),
                  () => toast(t.lunchUnmarked, { undo }),
                )
              }
            />
          </div>
        ),
      });
    }
    items.sort((a, b) => a.t - b.t);
  }

  let note: React.ReactNode = null;
  if (calc && settings) {
    if (calc.lunchStatus === "auto" && calc.autoLunch) {
      const name = projects.find((p) => p.id === calc.autoLunch?.projectId)?.name ?? "";
      note = (
        <>
          {t.noteAutoA(dur(calc.autoLunch.ms))}
          <b>{name}</b>
          {t.noteAutoB(ref)}
        </>
      );
    } else if (calc.lunchStatus === "pending") note = t.notePending(dur(settings.lunchMin * 60_000), ref);
    else if (calc.lunchStatus === "noneRunning") note = t.noteNone(ref);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>{t.backToWeek}</Button>
        <div className="flex items-center gap-1.5">
          <NavButton label={t.prevDay} onClick={() => onDayChange(addDays(day, -1))}>‹</NavButton>
          <b className="min-w-[200px] text-center text-[19px] font-semibold">{title}</b>
          <NavButton label={t.nextDay} onClick={() => onDayChange(addDays(day, 1))}>›</NavButton>
        </div>
        <Button size="sm" onClick={() => void addEntry()}>{t.addEntry}</Button>
      </div>

      {calc && (
        <>
          <Cards>
            <Card label={t.total} value={hours(totalMs)} />
            <Card label={`${t.jornada}${calc.isHoliday ? t.holidayParen : ""}`} value={hours(calc.jornadaMs)} />
            <Card label={t.overtime} value={hours(extraMs)} accent />
          </Cards>
          {(calc.segments.length > 0 || calc.lunch) && (
            <Timeline day={day} segments={calc.segments} lunch={calc.lunch} projects={projects} now={day === today ? now : null} />
          )}
          {items.length ? items.map((i) => i.node) : <div className="py-10 text-center text-dim">{t.emptyDay}</div>}
          {note && (
            <div className="mt-2.5 flex items-start gap-2.5 rounded-[10px] bg-[#151c2e] px-3 py-2.5 text-[13px] text-[#b9cbef]">
              <span aria-hidden>🍽</span>
              <span>{note}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
