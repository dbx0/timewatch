import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api";
import { toIso, weekStartOf } from "../../lib/dates";
import type { Grouping, IsoDate, WeekStart } from "../../lib/types";
import { ToastHost } from "../ui/Toast";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";

const REFRESH_MS = 15_000;

type View = { kind: "week" } | { kind: "day"; day: IsoDate };

export function ReportApp() {
  const [now, setNow] = useState(() => Date.now());
  const today = toIso(new Date(now));
  /** Any day of the shown week; the week itself follows the `weekStart` setting. */
  const [anchor, setAnchor] = useState<IsoDate>(() => toIso(new Date()));
  /** `null` until the setting loads, so the week is not fetched twice. */
  const [startPref, setStartPref] = useState<WeekStart | null>(null);
  const weekStart = weekStartOf(anchor, startPref ?? "monday");
  const [grouping, setGrouping] = useState<Grouping>("project");
  const [view, setView] = useState<View>({ kind: "week" });
  const [reloadKey, setReloadKey] = useState(0);
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    let off = false;
    const unlisten: (() => void)[] = [];
    const loadPref = () =>
      Promise.resolve(api.getSettings()).then(
        (s) => !off && setStartPref(s?.weekStart ?? "monday"),
        () => !off && setStartPref((p) => p ?? "monday"),
      );
    void loadPref();
    const reload = () => {
      lastRefresh.current = Date.now();
      setReloadKey((k) => k + 1);
      void loadPref();
    };
    void api.onChanged(reload).then((u) => (off ? u() : unlisten.push(u)));
    void api
      .onTick((ms) => {
        setNow(ms);
        if (ms - lastRefresh.current >= REFRESH_MS) {
          lastRefresh.current = ms;
          setReloadKey((k) => k + 1);
        }
      })
      .then((u) => (off ? u() : unlisten.push(u)));
    return () => {
      off = true;
      unlisten.forEach((u) => u());
    };
  }, []);

  return (
    <div data-view="report" className="mx-auto min-h-full max-w-[1040px] px-8 py-6">
      {view.kind === "week" ? (
        startPref && <WeekView
          weekStart={weekStart}
          thisWeek={weekStartOf(today, startPref)}
          grouping={grouping}
          today={today}
          reloadKey={reloadKey}
          onWeekChange={setAnchor}
          onGroupingChange={setGrouping}
          onOpenDay={(day) => setView({ kind: "day", day })}
        />
      ) : (
        <DayView
          key={view.day}
          day={view.day}
          today={today}
          now={now}
          reloadKey={reloadKey}
          onDayChange={(day) => setView({ kind: "day", day })}
          onBack={() => {
            setAnchor(view.day);
            setView({ kind: "week" });
          }}
        />
      )}
      <ToastHost />
    </div>
  );
}
