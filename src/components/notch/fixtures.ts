import { vi } from "vitest";
import type { Project, TrackerSnapshot } from "../../lib/types";

const H = 3_600_000;

export const projects: Project[] = [
  { id: 1, name: "Migração SAP", client: "Acme", color: "#3ddc84", archived: false },
  { id: 2, name: "Portal B2B", client: "Acme", color: "#5aa9ff", archived: false },
  { id: 3, name: "App Mobile", client: "Globex", color: "#ffb347", archived: false },
  { id: 4, name: "Legado", client: "Globex", color: "#c08bff", archived: true },
];

export function snapshot(over: Partial<TrackerSnapshot> = {}): TrackerSnapshot {
  return {
    status: "running",
    sessionProject: projects[1],
    sessionMs: H,
    runningSince: 1_000_000,
    todayMs: 3 * H,
    todayJornadaMs: 8 * H,
    recents: [
      { project: projects[1], todayMs: 2 * H, shortcut: 1 },
      { project: projects[0], todayMs: H, shortcut: 2 },
      { project: projects[2], todayMs: 0, shortcut: 3 },
    ],
    projects,
    pendingAbsence: null,
    canUndo: false,
    notice: null,
    ...over,
  };
}

/** The `../../lib/api` mock shape used by notch tests. */
export function apiMock() {
  const ok = () => vi.fn(() => Promise.resolve(undefined));
  const listen = () => vi.fn(() => Promise.resolve(() => {}));
  return {
    getSnapshot: ok(),
    switchProject: ok(),
    pauseClock: ok(),
    resumeClock: ok(),
    stopClock: ok(),
    resolveAbsence: ok(),
    undo: vi.fn(() => Promise.resolve(true)),
    createProject: ok(),
    openWindow: ok(),
    overlaySetHitRect: ok(),
    overlaySetExpanded: ok(),
    overlayFocus: ok(),
    getOverlayConfig: ok(),
    onChanged: listen(),
    onTick: listen(),
    onOverlayHover: listen(),
    onOverlayExpanded: listen(),
    onOverlayConfig: listen(),
    onOverlayFocusSearch: listen(),
  };
}
