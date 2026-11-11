// Mirrors the serialized Rust types (camelCase). Dates are `YYYY-MM-DD`, times are UTC epoch ms.

export type Ms = number;
export type IsoDate = string;

export interface Project {
  id: number;
  name: string;
  client: string;
  color: string;
  archived: boolean;
}

export interface Entry {
  id: number;
  projectId: number;
  start: Ms;
  end: Ms | null;
}

export interface Lunch {
  day: IsoDate;
  start: Ms;
  end: Ms;
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
}

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
}

export interface Seg {
  entryId: number;
  projectId: number;
  start: Ms;
  end: Ms;
  running: boolean;
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
