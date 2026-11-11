import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AbsenceResolution,
  ClosedEntry,
  DayDto,
  Entry,
  EntryPatch,
  ExportFormat,
  Grouping,
  HitRect,
  IsoDate,
  Ms,
  OverlayConfig,
  Project,
  Settings,
  TrackerSnapshot,
  WeekReport,
  WindowKind,
} from "./types";

export const getSnapshot = () => invoke<TrackerSnapshot>("get_snapshot");
export const switchProject = (projectId: number) => invoke<void>("switch_project", { projectId });
/** Resolves to the block it closed (null when nothing closed). */
export const pauseClock = () => invoke<ClosedEntry | null>("pause_clock");
export const resumeClock = () => invoke<void>("resume_clock");
export const stopClock = () => invoke<ClosedEntry | null>("stop_clock");
export const resolveAbsence = (resolution: AbsenceResolution) =>
  invoke<void>("resolve_absence", { resolution });
export const undo = () => invoke<boolean>("undo");

export const createProject = (name: string, client: string, color: string) =>
  invoke<Project>("create_project", { name, client, color });
export const updateProject = (project: Project) => invoke<void>("update_project", { project });

export const getWeek = (weekStart: IsoDate, grouping: Grouping) =>
  invoke<WeekReport>("get_week", { weekStart, grouping });
export const getDay = (day: IsoDate) => invoke<DayDto>("get_day", { day });
export const addEntry = (projectId: number, start: Ms, end: Ms) =>
  invoke<Entry>("add_entry", { projectId, start, end });
export const updateEntry = (id: number, patch: EntryPatch) =>
  invoke<Entry>("update_entry", {
    id,
    start: patch.start ?? null,
    end: patch.end ?? null,
    projectId: patch.projectId ?? null,
  });
export const deleteEntry = (id: number) => invoke<void>("delete_entry", { id });
/** Blank clears the note; the backend trims and caps at `MAX_NOTE_CHARS`. */
export const setEntryNote = (id: number, note: string | null) =>
  invoke<Entry>("set_entry_note", { id, note: note?.trim() ? note : null });
export const unmarkLunch = (day: IsoDate) => invoke<void>("unmark_lunch", { day });

export const getSettings = () => invoke<Settings>("get_settings");
export const setSettings = (settings: Settings) => invoke<void>("set_settings", { settings });

export const exportWeek = (
  weekStart: IsoDate,
  grouping: Grouping,
  format: ExportFormat,
  detailed: boolean,
  path: string,
) => invoke<void>("export_week", { weekStart, grouping, format, detailed, path });

export const openWindow = (kind: WindowKind) => invoke<void>("open_window", { kind });

export const overlaySetHitRect = (rect: HitRect | null) => invoke<void>("overlay_set_hit_rect", { rect });
export const overlaySetExpanded = (expanded: boolean) => invoke<void>("overlay_set_expanded", { expanded });
export const overlayFocus = () => invoke<void>("overlay_focus");
export const finishOnboarding = (projects: { name: string; client: string }[], startIndex: number | null) =>
  invoke<void>("finish_onboarding", { projects, startIndex });
export const skipOnboarding = () => invoke<void>("skip_onboarding");
export const getOverlayConfig = () => invoke<OverlayConfig | null>("get_overlay_config");

export const onChanged = (cb: (snapshot: TrackerSnapshot) => void): Promise<UnlistenFn> =>
  listen<TrackerSnapshot>("tracker://changed", (e) => cb(e.payload));
export const onTick = (cb: (now: Ms) => void): Promise<UnlistenFn> =>
  listen<{ now: Ms }>("tracker://tick", (e) => cb(e.payload.now));

export const onOverlayHover = (cb: (hover: boolean) => void): Promise<UnlistenFn> =>
  listen<boolean>("overlay://hover", (e) => cb(e.payload));
/** `focus` is true only for user-initiated opens (tray, shortcut); system opens never take the keyboard. */
export type OverlayExpanded = { expanded: boolean; focus: boolean };
export const onOverlayExpanded = (cb: (e: OverlayExpanded) => void): Promise<UnlistenFn> =>
  listen<OverlayExpanded>("overlay://expanded", (e) => cb(e.payload));
export const onOverlayConfig = (cb: (config: OverlayConfig) => void): Promise<UnlistenFn> =>
  listen<OverlayConfig>("overlay://config", (e) => cb(e.payload));
export const onOverlayFocusSearch = (cb: () => void): Promise<UnlistenFn> =>
  listen<null>("overlay://focus-search", () => cb());
export const onOverlayCoach = (cb: () => void): Promise<UnlistenFn> => listen<null>("overlay://coach", () => cb());
