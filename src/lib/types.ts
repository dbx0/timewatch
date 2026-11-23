// Mirrors the serialized Rust types (camelCase). Dates are `YYYY-MM-DD`, times are UTC epoch ms.

import type { LanguagePref } from "../i18n/types";

export type Ms = number;
export type IsoDate = string;

export interface Project {
  id: number;
  name: string;
  client: string;
  color: string;
  archived: boolean;
}

export interface ProjectUsage {
  entries: number;
  ms: Ms;
}

export interface DeletedProject extends ProjectUsage {
  project: Project;
}

export interface Entry {
  id: number;
  projectId: number;
  start: Ms;
  end: Ms | null;
  note: string | null;
}

/** The block a pause/stop just closed (for the note prompt). */
export interface ClosedEntry {
  id: number;
  projectId: number;
  start: Ms;
  end: Ms;
}

/** Longest note the backend accepts (chars). */
export const MAX_NOTE_CHARS = 500;

export interface Lunch {
  day: IsoDate;
  start: Ms;
  end: Ms;
}

/** One option of `list_monitors`: `id` is stored in `overlayMonitor`, `label` is shown. */
export interface MonitorOption {
  id: string;
  label: string;
  primary: boolean;
}

/** Why the global shortcut is not active (`error` is already localized). */
export interface ShortcutFailure {
  shortcut: string;
  error: string;
}

export interface Settings {
  roundingMin: number;
  /** Daily target hours, Monday..Sunday. */
  jornadaH: number[];
  holidays: IsoDate[];
  lunchMin: number;
  /** `HH:MM:SS` */
  lunchRef: string;
  idleMin: number;
  stopOnSleep: boolean;
  autostart: boolean;
  shortcut: string;
  overlayMonitor: string | null;
  onboarded: boolean;
  /** `system` follows the OS locale. */
  language: LanguagePref;
  /** First day of the report week (missing in mocks means Monday). */
  weekStart: WeekStart;
}

export type WeekStart = "monday" | "saturday";

export type ClockStatus = "idle" | "running" | "paused";
export type AbsenceReason = "idle" | "sleep";
export type Grouping = "project" | "client";
export type ExportFormat = "csv" | "html";
export type LunchStatus = "marked" | "auto" | "pending" | "noneRunning" | "disabled";
export type RowKind = "clientHeader" | "data";
/** `notch`: pill fits the MacBook notch; `strip`: thin collapsed strip (no notch). */
export type PillMode = "notch" | "strip";

/** Payload of `overlay://config`. */
export interface OverlayConfig {
  mode: PillMode;
  /** Logical px; null without a notch. */
  notchWidth: number | null;
  notchHeight: number | null;
  /** Collapsed pill size, logical px: notch + 120 px ears each side (notch) or 160×6 (strip). */
  pillWidth: number;
  pillHeight: number;
}

/** Interactive overlay area, logical px relative to the overlay window. */
export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Absence {
  start: Ms;
  end: Ms;
  reason: AbsenceReason;
  projectId: number;
}

export type AbsenceResolution =
  | { kind: "discount" }
  | { kind: "lunch" }
  | { kind: "keep" }
  | { kind: "moveTo"; projectId: number };

export interface RecentProject {
  project: Project;
  todayMs: number;
  shortcut: number | null;
}

export interface TrackerSnapshot {
  status: ClockStatus;
  sessionProject: Project | null;
  sessionMs: number;
  runningSince: Ms | null;
  todayMs: number;
  todayJornadaMs: number;
  recents: RecentProject[];
  projects: Project[];
  pendingAbsence: Absence | null;
  canUndo: boolean;
  notice: string | null;
  /** Identity of `notice` (kind + time), the same in every language. */
  noticeKey: string | null;
  lastClosedEntry: ClosedEntry | null;
}

export interface Seg {
  entryId: number;
  projectId: number;
  start: Ms;
  end: Ms;
  running: boolean;
  note: string | null;
}

export interface ProjectDay {
  normalMs: number;
  extraMs: number;
}

export interface AutoLunch {
  projectId: number;
  ms: number;
}

export interface DayCalc {
  day: IsoDate;
  segments: Seg[];
  /** Keyed by project id. */
  perProject: Record<string, ProjectDay>;
  lunch: Lunch | null;
  autoLunch: AutoLunch | null;
  lunchStatus: LunchStatus;
  jornadaMs: number;
  isHoliday: boolean;
}

export interface DayDto {
  day: DayCalc;
  projects: Project[];
}

export interface Cell {
  totalMs: number;
  extraMs: number;
}

export interface ReportRow {
  kind: RowKind;
  label: string;
  color: string | null;
  projectCount: number;
  /** Seven cells, Monday..Sunday. */
  cells: Cell[];
  total: Cell;
}

export interface WeekReport {
  weekStart: IsoDate;
  days: IsoDate[];
  holidays: boolean[];
  rows: ReportRow[];
  colTotals: Cell[];
  total: Cell;
  expectedMs: number;
  roundingMin: number;
  grouping: Grouping;
}

export interface EntryPatch {
  start?: Ms;
  end?: Ms;
  projectId?: number;
}

export type WindowKind = "report" | "settings" | "onboarding";
