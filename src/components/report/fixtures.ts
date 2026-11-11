import type { DayCalc, Project, WeekReport } from "../../lib/types";

export const H = 3_600_000;

export const projects: Project[] = [
  { id: 1, name: "Migração SAP", client: "Acme", color: "#3ddc84", archived: false },
  { id: 2, name: "Portal B2B", client: "Acme", color: "#5aa9ff", archived: false },
  { id: 3, name: "App Mobile", client: "Globex", color: "#ffb347", archived: false },
];

const cell = (totalMs: number, extraMs = 0) => ({ totalMs, extraMs });
const z = cell(0);

/** Week of 2026-11-09 (Monday). */
export function week(over: Partial<WeekReport> = {}): WeekReport {
  return {
    weekStart: "2026-11-09",
    days: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    holidays: [false, false, false, true, false, false, false],
    rows: [
      { kind: "clientHeader", label: "Acme", color: null, projectCount: 2, cells: [], total: z },
      {
        kind: "data",
        label: "Portal B2B",
        color: "#5aa9ff",
        projectCount: 1,
        cells: [cell(5.5 * H, H), z, z, z, z, z, z],
        total: cell(5.5 * H, H),
      },
    ],
    colTotals: [cell(5.5 * H, H), z, z, z, z, z, z],
    total: cell(5.5 * H, H),
    expectedMs: 40 * H,
    roundingMin: 0,
    grouping: "project",
    ...over,
  };
}

export function dayCalc(over: Partial<DayCalc> = {}): DayCalc {
  return {
    day: "2026-11-11",
    segments: [],
    perProject: {},
    lunch: null,
    autoLunch: null,
    lunchStatus: "disabled",
    jornadaMs: 8 * H,
    isHoliday: false,
    ...over,
  };
}
