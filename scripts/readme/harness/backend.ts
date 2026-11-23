// In-memory stand-in for the Rust backend: the same commands, payload shapes and events as
// src-tauri, over a fictional week of data. The rules mirror src-tauri/src/domain/calc.rs and
// src-tauri/src/tracker closely enough for the UI to behave like the real app.
import type {
  Absence,
  AbsenceResolution,
  Cell,
  ClosedEntry,
  DayCalc,
  Entry,
  Grouping,
  IsoDate,
  Lunch,
  LunchStatus,
  Ms,
  OverlayConfig,
  Project,
  ProjectDay,
  ReportRow,
  Seg,
  Settings,
  TrackerSnapshot,
  WeekReport,
} from "../../../src/lib/types";
import { addDays, atLocal, toIso, weekdayIndex } from "../../../src/lib/dates";

const MIN = 60_000;
const H = 60 * MIN;

type Emit = (event: string, payload?: unknown) => void;

interface Session {
  projectId: number;
  /** Closed blocks of this session (pauses excluded). */
  accumMs: number;
}

interface State {
  projects: Project[];
  entries: Entry[];
  lunches: Lunch[];
  settings: Settings;
  session: Session | null;
  paused: boolean;
  pending: Absence | null;
  lastClosed: ClosedEntry | null;
  nextId: number;
}

export interface SeedOptions {
  /** First run: no projects, no entries, onboarding not done. */
  fresh?: boolean;
}

const PROJECTS: Project[] = [
  { id: 1, name: "Website", client: "Acme Corp", color: "#5aa9ff", archived: false },
  { id: 2, name: "Migration", client: "Globex", color: "#3ddc84", archived: false },
  { id: 3, name: "Support", client: "Initech", color: "#ffb347", archived: false },
  { id: 4, name: "Meetings", client: "Internal", color: "#c08bff", archived: false },
  { id: 5, name: "Mobile app", client: "Acme Corp", color: "#ff6b8b", archived: false },
  { id: 6, name: "Reports", client: "Globex", color: "#4dd6d6", archived: false },
  { id: 7, name: "Legacy portal", client: "Initech", color: "#b0b0bb", archived: true },
];

/** [weekday 0=Mon, start, end (null = running), project, note] */
type Row = [number, string, string | null, number, string?];
const WEEK: Row[] = [
  [0, "09:02", "10:30", 1, "Homepage wireframes with the design team"],
  [0, "10:30", "11:00", 4, "Weekly planning"],
  [0, "11:00", "12:10", 1],
  [0, "13:05", "15:30", 2, "Mapped the legacy customer tables"],
  [0, "15:30", "16:20", 3, "Ticket triage"],
  [0, "16:20", "17:40", 2],
  [1, "08:45", "12:30", 2, "Dry run of the orders import"],
  [1, "13:20", "16:10", 2, "Fixed date parsing in the CSV loader"],
  [1, "16:10", "16:40", 4, "Client sync"],
  [1, "16:40", "19:55", 3, "Production incident: password reset emails"],
  [2, "09:10", "11:45", 1, "Navigation and footer components"],
  [2, "11:45", "12:30", 4, "Sprint review"],
  [2, "13:30", "17:20", 1, "Pricing page components"],
  [3, "09:00", "09:30", 4, "Stand-up"],
  [3, "09:30", "12:15", 1, "Hero section and pricing page review"],
  [3, "13:10", "14:20", 2, "Validated row counts after the import"],
  [3, "14:20", null, 1],
];
const LUNCHES: [number, string, string][] = [
  [0, "12:10", "13:05"],
  [1, "12:30", "13:20"],
  [2, "12:30", "13:30"],
  [3, "12:15", "13:10"],
];

const DEFAULT_SETTINGS: Settings = {
  roundingMin: 0,
  jornadaH: [8, 8, 8, 8, 8, 0, 0],
  holidays: ["2026-11-26", "2026-12-25"],
  lunchMin: 60,
  lunchRef: "12:00:00",
  idleMin: 15,
  stopOnSleep: false,
  autostart: true,
  shortcut: "Alt+Space",
  overlayMonitor: null,
  onboarded: true,
  language: "system",
  weekStart: "monday",
};

export const OVERLAY: OverlayConfig = { mode: "notch", notchWidth: 185, notchHeight: 32, pillWidth: 425, pillHeight: 32 };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class Backend {
  s: State;
  private undoState: State | null = null;
  clipboard = "";

  constructor(
    private emit: Emit,
    opts: SeedOptions = {},
  ) {
    this.s = opts.fresh ? this.freshState() : this.seed();
  }

  // ---- seed ---------------------------------------------------------------------------------

  private monday(): IsoDate {
    const today = toIso(new Date());
    return addDays(today, -weekdayIndex(today));
  }

  private seed(): State {
    const mon = this.monday();
    let id = 1;
    const entries: Entry[] = WEEK.map(([d, a, b, projectId, note]) => {
      const day = addDays(mon, d);
      return { id: id++, projectId, start: atLocal(day, a), end: b ? atLocal(day, b) : null, note: note ?? null };
    });
    const lunches = LUNCHES.map(([d, a, b]) => {
      const day = addDays(mon, d);
      return { day, start: atLocal(day, a), end: atLocal(day, b) };
    });
    const open = entries.find((e) => e.end === null);
    return {
      projects: clone(PROJECTS),
      entries,
      lunches,
      settings: clone(DEFAULT_SETTINGS),
      session: open ? { projectId: open.projectId, accumMs: 0 } : null,
      paused: false,
      pending: null,
      lastClosed: null,
      nextId: id,
    };
  }

  private freshState(): State {
    return {
      projects: [],
      entries: [],
      lunches: [],
      settings: { ...clone(DEFAULT_SETTINGS), onboarded: false, holidays: [] },
      session: null,
      paused: false,
      pending: null,
      lastClosed: null,
      nextId: 1,
    };
  }

  // ---- helpers ------------------------------------------------------------------------------

  private now = () => Date.now();
  private open = () => this.s.entries.find((e) => e.end === null) ?? null;
  private project = (id: number) => this.s.projects.find((p) => p.id === id);

  private checkpoint() {
    this.undoState = clone(this.s);
  }

  private changed() {
    this.emit("tracker://changed", this.snapshot());
  }

  /** Closes the open entry at `at`; returns it (null when nothing was open). */
  private closeOpen(at: Ms): ClosedEntry | null {
    const o = this.open();
    if (!o) return null;
    o.end = Math.max(o.start, at);
    const c = { id: o.id, projectId: o.projectId, start: o.start, end: o.end };
    this.s.lastClosed = c;
    return c;
  }

  private openEntry(projectId: number, start: Ms): Entry {
    const e: Entry = { id: this.s.nextId++, projectId, start, end: null, note: null };
    this.s.entries.push(e);
    return e;
  }

  private jornadaMs(day: IsoDate) {
    if (this.s.settings.holidays.includes(day)) return 0;
    return Math.round((this.s.settings.jornadaH[weekdayIndex(day)] ?? 0) * H);
  }

  // ---- snapshot -----------------------------------------------------------------------------

  snapshot(): TrackerSnapshot {
    const now = this.now();
    const open = this.open();
    const sess = this.s.session;
    const status = open ? "running" : sess && this.s.paused ? "paused" : "idle";
    const sessionMs = sess && status !== "idle" ? sess.accumMs + (open ? Math.max(0, now - open.start) : 0) : 0;
    const today = toIso(new Date(now));
    const segs = this.segments(today, now);
    const projectToday = (id: number) => segs.filter((g) => g.projectId === id).reduce((a, g) => a + g.end - g.start, 0);

    // Most recently used first (by latest entry start), then alphabetical, up to 4.
    const lastUse = new Map<number, number>();
    for (const e of this.s.entries) lastUse.set(e.projectId, Math.max(lastUse.get(e.projectId) ?? 0, e.start));
    const active = this.s.projects.filter((p) => !p.archived);
    const used = active.filter((p) => lastUse.has(p.id)).sort((a, b) => lastUse.get(b.id)! - lastUse.get(a.id)!);
    const rest = active.filter((p) => !lastUse.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    const picked = [...used, ...rest].slice(0, 4);

    return {
      status,
      sessionProject: status === "idle" || !sess ? null : (this.project(sess.projectId) ?? null),
      sessionMs,
      runningSince: open?.start ?? null,
      todayMs: segs.reduce((a, g) => a + g.end - g.start, 0),
      todayJornadaMs: this.jornadaMs(today),
      recents: picked.map((p, i) => ({ project: p, todayMs: projectToday(p.id), shortcut: i + 1 })),
      projects: this.s.projects,
      pendingAbsence: this.s.pending,
      canUndo: this.undoState !== null,
      notice: null,
      noticeKey: null,
      lastClosedEntry: this.s.lastClosed,
    };
  }

  // ---- calc (mirrors domain/calc.rs) ----------------------------------------------------------

  private segments(day: IsoDate, now: Ms): Seg[] {
    const lo = atLocal(day, "00:00");
    const hi = atLocal(addDays(day, 1), "00:00");
    return this.s.entries
      .map((e) => {
        const start = Math.max(e.start, lo);
        const end = Math.min(e.end ?? now, hi);
        return { entryId: e.id, projectId: e.projectId, start, end, running: e.end === null, note: e.note };
      })
      .filter((g) => g.end > g.start)
      .sort((a, b) => a.start - b.start || a.entryId - b.entryId);
  }

  dayCalc(day: IsoDate): DayCalc {
    const now = this.now();
    const today = toIso(new Date(now));
    const st = this.s.settings;
    const segments = this.segments(day, now);
    const lens = segments.map((g) => g.end - g.start);
    const lunch = this.s.lunches.find((l) => l.day === day) ?? null;
    let autoLunch: DayCalc["autoLunch"] = null;
    let lunchStatus: LunchStatus;
    if (lunch) lunchStatus = "marked";
    else if (st.lunchMin === 0) lunchStatus = "disabled";
    else if (day >= today) lunchStatus = "pending";
    else {
      const ref = atLocal(day, st.lunchRef.slice(0, 5));
      const i = segments.findIndex((g) => g.start <= ref && ref < g.end);
      if (i < 0) lunchStatus = "noneRunning";
      else {
        const ms = Math.min(lens[i], st.lunchMin * MIN);
        lens[i] -= ms;
        autoLunch = { projectId: segments[i].projectId, ms };
        lunchStatus = "auto";
      }
    }
    const jornadaMs = this.jornadaMs(day);
    const perProject: Record<string, ProjectDay> = {};
    let acc = 0;
    segments.forEach((g, i) => {
      const len = lens[i];
      const normal = Math.min(Math.max(jornadaMs - acc, 0), len);
      const p = (perProject[g.projectId] ??= { normalMs: 0, extraMs: 0 });
      p.normalMs += normal;
      p.extraMs += len - normal;
      acc += len;
    });
    return { day, segments, perProject, lunch, autoLunch, lunchStatus, jornadaMs, isHoliday: st.holidays.includes(day) };
  }

  weekReport(weekStart: IsoDate, grouping: Grouping): WeekReport {
    const st = this.s.settings;
    const round = (ms: number) => roundMs(ms, st.roundingMin);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const calcs = days.map((d) => this.dayCalc(d));
    const zero = (): Cell => ({ totalMs: 0, extraMs: 0 });
    const perProject: [Project, Cell[]][] = [];
    for (const p of this.s.projects) {
      let any = false;
      const cells = calcs.map((c) => {
        const pd = c.perProject[p.id];
        if (!pd) return zero();
        if (pd.normalMs + pd.extraMs > 0) any = true;
        const extra = round(pd.extraMs);
        return { totalMs: round(pd.normalMs) + extra, extraMs: extra };
      });
      if (any) perProject.push([p, cells]);
    }
    perProject.sort(([a], [b]) => a.client.toLowerCase().localeCompare(b.client.toLowerCase()) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const sum = (groups: Cell[][]): [Cell[], Cell] => {
      const cells = days.map((_, i) => ({
        totalMs: groups.reduce((a, g) => a + g[i].totalMs, 0),
        extraMs: groups.reduce((a, g) => a + g[i].extraMs, 0),
      }));
      return [cells, { totalMs: cells.reduce((a, c) => a + c.totalMs, 0), extraMs: cells.reduce((a, c) => a + c.extraMs, 0) }];
    };
    const rows: ReportRow[] = [];
    for (let i = 0; i < perProject.length; ) {
      const client = perProject[i][0].client;
      let j = i;
      while (j < perProject.length && perProject[j][0].client === client) j++;
      const group = perProject.slice(i, j);
      if (grouping === "project") {
        rows.push({ kind: "clientHeader", label: client, color: null, projectCount: 0, cells: days.map(zero), total: zero() });
        for (const [p, cells] of group) {
          rows.push({ kind: "data", label: p.name, color: p.color, projectCount: 1, cells, total: sum([cells])[1] });
        }
      } else {
        const [cells, total] = sum(group.map(([, c]) => c));
        rows.push({ kind: "data", label: client, color: null, projectCount: group.length, cells, total });
      }
      i = j;
    }
    const [colTotals, total] = sum(perProject.map(([, c]) => c));
    return {
      weekStart,
      days,
      holidays: days.map((d) => st.holidays.includes(d)),
      rows,
      colTotals,
      total,
      expectedMs: days.reduce((a, d) => a + this.jornadaMs(d), 0),
      roundingMin: st.roundingMin,
      grouping,
    };
  }

  // ---- demo controls ------------------------------------------------------------------------

  /** The user was away (no input) for `minutes`, until now, with the clock running. */
  triggerAbsence(minutes: number, reason: "idle" | "sleep" = "idle") {
    const o = this.open();
    if (!o) return;
    const end = this.now();
    this.s.pending = { start: end - minutes * MIN, end, reason, projectId: o.projectId };
    this.changed();
  }

  // ---- commands -----------------------------------------------------------------------------

  async invoke(cmd: string, a: Record<string, any> = {}): Promise<unknown> {
    const now = this.now();
    switch (cmd) {
      case "get_snapshot":
        return this.snapshot();
      case "get_settings":
        return this.s.settings;
      case "set_settings": {
        this.s.settings = a.settings;
        this.changed();
        return null;
      }
      case "get_language":
        return "en";
      case "list_monitors":
        return [
          { id: "built-in", label: "Built-in display", primary: true },
          { id: "external-27", label: "27-inch display", primary: false },
        ];
      case "get_shortcut_failure":
        return null;
      case "get_overlay_config":
        return OVERLAY;

      case "switch_project": {
        const pid = a.projectId as number;
        this.checkpoint();
        this.closeOpen(now);
        this.openEntry(pid, now);
        this.s.session = { projectId: pid, accumMs: 0 };
        this.s.paused = false;
        this.changed();
        return null;
      }
      case "pause_clock": {
        const o = this.open();
        if (!o || !this.s.session) return null;
        this.checkpoint();
        const c = this.closeOpen(now)!;
        this.s.session.accumMs += c.end - c.start;
        this.s.paused = true;
        this.changed();
        return c;
      }
      case "resume_clock": {
        if (!this.s.session || !this.s.paused) return null;
        this.checkpoint();
        this.openEntry(this.s.session.projectId, now);
        this.s.paused = false;
        this.changed();
        return null;
      }
      case "stop_clock": {
        this.checkpoint();
        const c = this.closeOpen(now);
        this.s.session = null;
        this.s.paused = false;
        this.changed();
        return c;
      }
      case "resolve_absence": {
        const p = this.s.pending;
        if (!p) return null;
        this.checkpoint();
        const r = a.resolution as AbsenceResolution;
        const o = this.open();
        if (r.kind !== "keep" && o) {
          o.end = p.start;
          if (r.kind === "moveTo") {
            const moved = this.openEntry(r.projectId, p.start);
            moved.end = p.end;
          }
          this.openEntry(o.projectId, p.end);
          // The block before the absence stays in the session; the away time leaves it.
          if (this.s.session) this.s.session.accumMs += Math.max(0, p.start - o.start);
          if (r.kind === "lunch") {
            const day = toIso(new Date(p.start));
            this.s.lunches = this.s.lunches.filter((l) => l.day !== day);
            this.s.lunches.push({ day, start: p.start, end: p.end });
          }
        }
        this.s.pending = null;
        this.changed();
        return null;
      }
      case "undo": {
        if (!this.undoState) return false;
        this.s = this.undoState;
        this.undoState = null;
        this.changed();
        return true;
      }

      case "create_project": {
        const p: Project = { id: Math.max(0, ...this.s.projects.map((x) => x.id)) + 1, name: a.name, client: a.client, color: a.color, archived: false };
        this.s.projects.push(p);
        this.changed();
        return p;
      }
      case "update_project": {
        const p = a.project as Project;
        this.s.projects = this.s.projects.map((x) => (x.id === p.id ? p : x));
        this.changed();
        return null;
      }
      case "project_usage": {
        const es = this.s.entries.filter((e) => e.projectId === a.id);
        return { entries: es.length, ms: es.reduce((acc, e) => acc + (e.end ?? now) - e.start, 0) };
      }
      case "delete_project": {
        this.checkpoint();
        const p = this.project(a.id)!;
        const es = this.s.entries.filter((e) => e.projectId === a.id);
        this.s.projects = this.s.projects.filter((x) => x.id !== a.id);
        this.s.entries = this.s.entries.filter((e) => e.projectId !== a.id);
        this.changed();
        return { project: p, entries: es.length, ms: es.reduce((acc, e) => acc + (e.end ?? now) - e.start, 0) };
      }

      case "get_week":
        return this.weekReport(a.weekStart, a.grouping);
      case "get_day":
        return { day: this.dayCalc(a.day), projects: this.s.projects };
      case "add_entry": {
        this.checkpoint();
        const e: Entry = { id: this.s.nextId++, projectId: a.projectId, start: a.start, end: a.end, note: null };
        this.s.entries.push(e);
        this.changed();
        return e;
      }
      case "update_entry": {
        const e = this.s.entries.find((x) => x.id === a.id);
        if (!e) throw "Record not found";
        this.checkpoint();
        if (a.start != null) e.start = a.start;
        if (a.end != null && e.end !== null) e.end = a.end;
        if (a.projectId != null) e.projectId = a.projectId;
        this.changed();
        return e;
      }
      case "delete_entry": {
        this.checkpoint();
        this.s.entries = this.s.entries.filter((x) => x.id !== a.id);
        this.changed();
        return null;
      }
      case "set_entry_note": {
        const e = this.s.entries.find((x) => x.id === a.id);
        if (!e) throw "Record not found";
        e.note = typeof a.note === "string" ? a.note.trim().slice(0, 500) : null;
        this.changed();
        return e;
      }
      case "unmark_lunch": {
        this.checkpoint();
        this.s.lunches = this.s.lunches.filter((l) => l.day !== a.day);
        this.changed();
        return null;
      }
      case "export_week":
        return null;

      case "finish_onboarding": {
        const list = a.projects as { name: string; client: string }[];
        const palette = ["#3ddc84", "#5aa9ff", "#ffb347", "#c08bff", "#ff6b8b", "#4dd6d6"];
        list.forEach((p, i) => this.s.projects.push({ id: i + 1, name: p.name, client: p.client, color: palette[i % palette.length], archived: false }));
        this.s.nextId = 1;
        this.s.settings = { ...this.s.settings, onboarded: true };
        if (a.startIndex != null) {
          const pid = a.startIndex + 1;
          this.openEntry(pid, now);
          this.s.session = { projectId: pid, accumMs: 0 };
        }
        this.changed();
        return null;
      }
      case "skip_onboarding":
        return null;

      // Window and overlay commands are handled by the desktop page before reaching here.
      default:
        throw `unknown command ${cmd}`;
    }
  }
}

/** Mirrors format.ts `roundMs` (imported locally to keep the backend free of the i18n store). */
function roundMs(ms: number, roundingMin: number): number {
  if (roundingMin === 0) return ms;
  const step = roundingMin * MIN;
  return Math.floor((ms + step / 2) / step) * step;
}
