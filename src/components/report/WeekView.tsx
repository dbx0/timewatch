import { useCallback, useEffect, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as api from "../../lib/api";
import { addDays, errMsg, toIso, weekdayIndex } from "../../lib/dates";
import { dayLabel, dec, weekdayShort } from "../../lib/format";
import { useT, getT } from "../../i18n";
import { clientLabel } from "../../lib/client";
import type { Cell, Grouping, IsoDate, WeekReport } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { Card, Cards, NavButton } from "./Cards";
import { ExportMenu } from "./ExportMenu";

interface Props {
  weekStart: IsoDate;
  /** First day of the current week. */
  thisWeek: IsoDate;
  grouping: Grouping;
  today: IsoDate;
  reloadKey: number;
  onWeekChange: (w: IsoDate) => void;
  onGroupingChange: (g: Grouping) => void;
  onOpenDay: (day: IsoDate) => void;
}

async function copy(value: string) {
  const t = getT().report;
  try {
    await writeText(value);
    toast(t.copied(value));
  } catch {
    toast(t.copyFailed);
  }
}

export function WeekView({ weekStart, thisWeek, grouping, today, reloadKey, onWeekChange, onGroupingChange, onOpenDay }: Props) {
  const t = useT().report;
  const [report, setReport] = useState<WeekReport | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    api.getWeek(weekStart, grouping).then(
      (r) => id === seq.current && setReport(r),
      (e) => id === seq.current && toast(errMsg(e)),
    );
  }, [weekStart, grouping]);

  useEffect(load, [load, reloadKey]);

  const isThisWeek = weekStart === thisWeek;
  const days = report?.days ?? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const num = (cell: Cell, i: number, opts: { extra?: boolean } = {}) => {
    const ms = opts.extra ? cell.extraMs : cell.totalMs;
    const isToday = days[i] === today;
    if (!ms) {
      return (
        <td key={i} className={`h-11 border-t border-[#1d1d24] text-center tabular-nums text-dim ${isToday ? "bg-accent/5" : ""}`}>
          ·
        </td>
      );
    }
    return (
      <td key={i} className={`h-11 border-t border-[#1d1d24] p-0 text-center tabular-nums ${isToday ? "bg-accent/5" : ""} ${opts.extra ? "text-accent2" : ""}`}>
        <CopyButton value={dec(ms)} hint={!opts.extra}>
          {dec(ms)}
          {!opts.extra && cell.extraMs > 0 && <span className="block text-[11px] leading-none text-accent2">{t.extra(dec(cell.extraMs))}</span>}
        </CopyButton>
      </td>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <NavButton label={t.prevWeek} onClick={() => onWeekChange(addDays(weekStart, -7))}>‹</NavButton>
          <b className="min-w-[200px] text-center text-[19px] font-semibold">
            {dayLabel(days[0])} – {dayLabel(days[6])}
          </b>
          <NavButton label={t.nextWeek} onClick={() => onWeekChange(addDays(weekStart, 7))}>›</NavButton>
          {!isThisWeek && (
            <Button size="sm" variant="ghost" onClick={() => onWeekChange(toIso(new Date()))}>
              {t.thisWeek}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Segmented
            ariaLabel={t.grouping}
            value={grouping}
            onChange={onGroupingChange}
            options={[
              { value: "project", label: t.byProject },
              { value: "client", label: t.byClient },
            ]}
          />
          <ExportMenu weekStart={weekStart} grouping={grouping} />
        </div>
      </div>

      {report && (
        <>
          <Cards>
            <Card label={t.totalWorked} value={`${dec(report.total.totalMs) || "0"}h`} />
            <Card label={t.expected} value={`${dec(report.expectedMs) || "0"}h`} />
            <Card label={t.overtime} value={`${dec(report.total.extraMs) || "0"}h`} accent />
          </Cards>

          {report.rows.length === 0 ? (
            <div className="py-[60px] text-center text-dim">{t.emptyWeek}</div>
          ) : (
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="w-[26%]" />
                  {report.days.map((d, i) => (
                    <th key={d} className="px-1 pb-2.5 pt-1.5 text-center font-medium">
                      <button
                        type="button"
                        onClick={() => onOpenDay(d)}
                        className={`inline-flex cursor-pointer flex-col items-center rounded-[10px] px-2.5 py-1.5 text-mute outline-none hover:bg-raise2 hover:text-text focus-visible:ring-2 focus-visible:ring-accent2`}
                      >
                        {weekdayShort(weekdayIndex(d))}
                        <b className={`text-base font-semibold ${d === today ? "text-accent" : "text-text"}`}>{Number(d.slice(8))}</b>
                        {report.holidays[i] && <span className="text-[10px] text-accent2">{t.holiday}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="font-medium text-mute">{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, ri) =>
                  r.kind === "clientHeader" ? (
                    <tr key={ri}>
                      <td colSpan={9} className="h-[34px] pb-1 align-bottom text-[11px] uppercase tracking-[.06em] text-dim">
                        {clientLabel(r.label)}
                      </td>
                    </tr>
                  ) : (
                    <tr key={ri}>
                      <td className="h-11 border-t border-[#1d1d24] pl-1">
                        <span className="flex items-center gap-2.5">
                          {r.color && <i className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: r.color }} />}
                          <span>
                            {grouping === "client" ? clientLabel(r.label) : r.label}
                            {grouping === "client" && (
                              <span className="ml-2 text-xs text-dim">{t.projects(r.projectCount)}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      {r.cells.map((c, i) => num(c, i))}
                      <TotalCell cell={r.total} />
                    </tr>
                  ),
                )}
                <tr>
                  <td className="h-11 border-t border-[#34343e] pl-1 font-semibold">{t.total}</td>
                  {report.colTotals.map((c, i) => num({ totalMs: c.totalMs, extraMs: 0 }, i))}
                  <TotalCell cell={{ totalMs: report.total.totalMs, extraMs: 0 }} top />
                </tr>
                <tr className="text-accent2">
                  <td className="h-[34px] pl-1">{t.overtime}</td>
                  {report.colTotals.map((c, i) => num(c, i, { extra: true }))}
                  <td className="h-[34px] text-center font-semibold tabular-nums">{dec(report.total.extraMs) || "·"}</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="mt-3 text-xs text-dim">{t.hint(report.roundingMin)}</div>
        </>
      )}
    </>
  );
}

function TotalCell({ cell, top }: { cell: Cell; top?: boolean }) {
  const t = useT().report;
  const border = top ? "border-[#34343e]" : "border-[#1d1d24]";
  if (!cell.totalMs) return <td className={`h-11 border-t ${border} text-center text-dim`}>·</td>;
  return (
    <td className={`h-11 border-t ${border} p-0 text-center font-semibold tabular-nums`}>
      <CopyButton value={dec(cell.totalMs)}>
        {dec(cell.totalMs)}
        {cell.extraMs > 0 && <span className="block text-[11px] font-normal leading-none text-accent2">{t.extra(dec(cell.extraMs))}</span>}
      </CopyButton>
    </td>
  );
}

/** A number in the grid: a real button (Tab, Enter/Space) that copies its value. */
function CopyButton({ value, hint = true, children }: { value: string; hint?: boolean; children: React.ReactNode }) {
  const t = useT().report;
  return (
    <button
      type="button"
      title={hint ? t.copyHint : undefined}
      aria-label={t.copyValue(value)}
      onClick={() => void copy(value)}
      className="flex h-11 w-full cursor-copy flex-col items-center justify-center rounded-md tabular-nums outline-none hover:bg-[#1a1f30] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent2"
    >
      {children}
    </button>
  );
}
