# Timewatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Timewatch, a Tauri 2 desktop app for macOS and Windows that tracks which client/project a consultant is working on from a notch overlay and produces weekly hour reports (with overtime and rounding) ready to copy or export.

**Architecture:** All business rules (clock state machine, absence handling, lunch deduction, overtime, rounding, reports, exports) live in pure, unit-tested Rust over a local SQLite database. The React frontend is a thin view layer split into four webview windows (notch overlay, report, settings, onboarding) that call Tauri commands and re-render on a single `tracker://changed` event. Native work (non-activating overlay, notch geometry, idle time, click-through) is isolated in `src-tauri/src/platform/{macos,windows}`.

**Tech Stack:** Tauri 2.12, Rust 1.97 (edition 2021), rusqlite 0.42 (`bundled`), chrono + chrono-tz-free local time via `chrono::Local`, tauri-plugin-{single-instance, global-shortcut, autostart, dialog, clipboard-manager}, tauri-nspanel (git, branch `v2.1`), objc2-app-kit 0.3 (macOS), windows 0.62 (Windows); React 19, TypeScript, Vite 8, Tailwind CSS 4, Framer Motion, Zustand 5, Vitest 5 + Testing Library, pnpm 9.

**Spec:** `docs/superpowers/specs/2026-11-11-timewatch-design.md` (read it first; section numbers below refer to it). Visual reference: `.superpowers/brainstorm/48038-1794341281/content/prototipo-v2.html` (behavior and look only, not code to copy).

## Global Constraints

- Tauri 2 + Rust backend; React 19 + TypeScript + Vite + Tailwind + Framer Motion + Zustand; package manager pnpm.
- Platform code only under `src-tauri/src/platform/macos` and `src-tauri/src/platform/windows`; the frontend never calls platform-specific APIs.
- Single app instance; runs continuously in background; no network calls, no accounts; all data in SQLite in the app data dir.
- Time is stored exact as UTC epoch milliseconds (`i64`). Rounding only affects display and export.
- No native form controls in the UI (no `<select>`, checkbox, radio, `type=time|date|number`). Text `<input>` styled is allowed.
- Dark theme. Buttons, toggles, chips, focus and state colors use only blue and white tones: accent `#4f86ff`, light accent `#a8c4ff`, white. No green/yellow/red UI states. Project identity dots keep their own colors. Overtime is shown in `#a8c4ff`.
- UI language Portuguese (pt-BR); all user-facing strings live in `src/i18n/pt-BR.ts` (Rust-generated strings for exports in `src-tauri/src/i18n.rs`).
- Hours shown as decimals with comma (`5,5`), up to 2 decimals, trailing zeros trimmed.
- Defaults (spec 6.7): rounding 0 (exact); jornada Mon–Fri 8h, Sat–Sun 0h; lunch 60 min at 12:00; idle threshold 15 min; stop on sleep off; autostart on; global shortcut `Alt+Space`; overlay monitor = primary.
- macOS-only and Windows-only code must compile out cleanly with `#[cfg(target_os = ...)]`.

## Review Focus

1. A running entry crossing midnight (working late) must split into both days in reports and day views; overtime of each day is computed independently.
2. DST change days (23h/25h): day bounds come from local midnight via the time zone, never `start + 24h`.
3. Client or project names containing `;`, `"` or newlines must be quoted/escaped in CSV and HTML-escaped in the HTML export.
4. Editing or adding an entry that ends before it starts or overlaps another entry must be rejected with a clear message and leave data unchanged.
5. Quitting (or crashing) while an absence question is pending: on quit the entry closes at the absence start; on startup after a crash the 2‑minute heartbeat rule applies.

---

## File Structure

```text
src-tauri/
  Cargo.toml  tauri.conf.json  build.rs  capabilities/default.json
  src/
    main.rs                 # calls timewatch_lib::run()
    lib.rs                  # builder: plugins, state, windows, tray, threads
    i18n.rs                 # pt-BR strings used by exports/tray
    domain/
      mod.rs
      model.rs              # Project, Entry, Lunch, Settings (+defaults), Ms
      time.rs               # day bounds, week start, local helpers (generic over TimeZone)
      calc.rs               # day segments, day calc, rounding, week/day reports
    store/
      mod.rs  db.rs         # open + migrations
      repo.rs               # CRUD for projects, entries, lunches, settings, meta
    tracker/
      mod.rs                # Tracker service: clock state machine, absence, undo, heartbeat, snapshot
      undo.rs
    absence.rs              # AbsenceMonitor: idle + sleep-gap detection loop (pure logic + thread)
    export/
      mod.rs  csv.rs  html.rs
    commands/
      mod.rs                # #[tauri::command] wrappers, AppState
    window/
      mod.rs                # create/show windows; overlay geometry + hit-rect polling
    tray/
      mod.rs
    platform/
      mod.rs                # trait-free fn facade: idle_seconds(), notch_info(), make_overlay(win)
      macos/mod.rs
      windows/mod.rs
src/
  main.tsx                  # mounts view by ?view=notch|report|settings|onboarding
  i18n/pt-BR.ts
  lib/types.ts              # TS mirrors of Rust serde types
  lib/api.ts                # typed invoke() wrappers + event subscription
  lib/format.ts             # dec(), dur(), clock(), dates
  stores/tracker.ts         # Zustand store fed by tracker://changed
  styles/index.css          # Tailwind + tokens
  components/ui/            # Button, Popover, Dropdown, TimePicker, Calendar, Toggle, Stepper, Segmented, ColorPicker, Toast
  components/notch/         # NotchApp, Pill, Panel, ProjectSearch, AllProjects, CreateProject, AbsencePrompt, DayProgress
  components/report/        # ReportApp, WeekView, DayView, Timeline, EntryRow, ExportMenu
  components/settings/      # SettingsApp + sections
  components/onboarding/    # OnboardingApp + steps
.github/workflows/build.yml
README.md  docs/ARCHITECTURE.md
```

---

### Task 1: Scaffold the project

**Files:**
- Create: everything under `src-tauri/` and `src/` needed by `pnpm create tauri-app` (template `react-ts`), `.gitignore`, `vitest.config.ts`, `src/main.tsx`, `src/styles/index.css`
- Test: `src/lib/format.test.ts` (placeholder replaced in Task 11), `src-tauri/src/domain/mod.rs` (one `#[test]`)

**Interfaces:**
- Produces: `src/main.tsx` reads `new URLSearchParams(location.search).get("view")` and renders a component per view (`notch`, `report`, `settings`, `onboarding`; unknown → `report`). Rust crate name `timewatch_lib`, product name `Timewatch`, identifier `dev.timewatch.app`.

- [ ] **Step 1:** `git init` in the repo root; `.gitignore` includes `node_modules/`, `dist/`, `src-tauri/target/`, `.superpowers/`.
- [ ] **Step 2:** Scaffold Tauri 2 + React + TS with pnpm into the existing directory (keep `docs/`). Add Tailwind 4 (`@tailwindcss/vite`), framer-motion, zustand, vitest, @testing-library/react, jsdom. Set Rust edition 2021 and add rusqlite (`bundled`), chrono (`serde`), serde, serde_json, thiserror.
- [ ] **Step 3:** Add plugin `tauri-plugin-single-instance` (second launch focuses the report window). Remove the template's default window from `tauri.conf.json` (windows are created in code, Task 9/10). Set `"macOSPrivateApi": true` (needed for transparent windows).
- [ ] **Step 4:** Add a trivial Rust test and a trivial Vitest test; run `cd src-tauri && cargo test` and `pnpm vitest run`. Expected: both PASS.
- [ ] **Step 5:** Run `pnpm tauri dev` once to confirm it builds (no window is expected yet besides what `lib.rs` opens; temporarily open the report view to confirm React renders).
- [ ] **Step 6:** Commit, including `docs/` (spec and this plan): `git add -A && git commit -m "chore: scaffold tauri app"`.

---

### Task 2: Domain model and time helpers

**Files:**
- Create: `src-tauri/src/domain/model.rs`, `src-tauri/src/domain/time.rs`
- Test: inline `#[cfg(test)] mod tests` in each

**Interfaces:**
- Produces (all `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]`, `#[serde(rename_all = "camelCase")]`):
  - `pub type Ms = i64;`
  - `pub struct Project { pub id: i64, pub name: String, pub client: String, pub color: String, pub archived: bool }`
  - `pub struct Entry { pub id: i64, pub project_id: i64, pub start: Ms, pub end: Option<Ms> }`
  - `pub struct Lunch { pub day: NaiveDate, pub start: Ms, pub end: Ms }`
  - `pub struct Settings { pub rounding_min: u32, pub jornada_h: [f32; 7] /* Mon..Sun */, pub holidays: Vec<NaiveDate>, pub lunch_min: u32, pub lunch_ref: NaiveTime, pub idle_min: u32, pub stop_on_sleep: bool, pub autostart: bool, pub shortcut: String, pub overlay_monitor: Option<String>, pub onboarded: bool }` with `impl Default` using the Global Constraints defaults.
  - `Settings::jornada_ms(&self, day: NaiveDate) -> i64` (0 for holidays).
  - `time::day_bounds<Tz: TimeZone>(tz: &Tz, day: NaiveDate) -> (Ms, Ms)` — local midnight to next local midnight.
  - `time::local_day<Tz: TimeZone>(tz: &Tz, ms: Ms) -> NaiveDate`
  - `time::at<Tz: TimeZone>(tz: &Tz, day: NaiveDate, t: NaiveTime) -> Ms`
  - `time::week_start(day: NaiveDate) -> NaiveDate` (Monday)

- [ ] **Step 1: Write failing tests**
  - `settings_defaults`: `rounding_min == 0`, `jornada_h == [8.,8.,8.,8.,8.,0.,0.]`, `lunch_min == 60`, `lunch_ref == 12:00`, `idle_min == 15`, `!stop_on_sleep`, `autostart`, `shortcut == "Alt+Space"`, `!onboarded`.
  - `jornada_holiday_is_zero`: a Monday listed in `holidays` → `jornada_ms == 0`; a normal Monday → `8 * 3_600_000`.
  - `day_bounds_dst`: with `chrono_tz`-free fixture use a `FixedOffset` for the normal case (`end - start == 86_400_000`) and, for DST, add dev-dependency `chrono-tz` and assert `America/New_York` 2026-03-08 has length `23 * 3_600_000` and 2026-11-01 `25 * 3_600_000`.
  - `week_start_is_monday`: 2026-11-11 (Wed) → 2026-11-09; 2026-11-15 (Sun) → 2026-11-09.
- [ ] **Step 2:** `cargo test domain::` → FAIL (types missing).
- [ ] **Step 3:** Implement. Ambiguous local midnight → `earliest()`; nonexistent → first valid instant after it.
- [ ] **Step 4:** `cargo test domain::` → PASS.
- [ ] **Step 5:** Commit `feat(domain): model, settings defaults, time helpers`.

---

### Task 3: Calculations (lunch, overtime, rounding, reports)

**Files:**
- Create: `src-tauri/src/domain/calc.rs`
- Test: inline tests

**Interfaces:**
- Consumes: Task 2 types and `time::*`.
- Produces:
  - `pub struct Seg { pub entry_id: i64, pub project_id: i64, pub start: Ms, pub end: Ms, pub running: bool }`
  - `pub fn day_segments(entries: &[Entry], bounds: (Ms, Ms), now: Ms) -> Vec<Seg>` — clip to bounds, open entries end at `now`, sorted by start.
  - `pub struct ProjectDay { pub normal_ms: i64, pub extra_ms: i64 }`
  - `pub struct AutoLunch { pub project_id: i64, pub ms: i64 }`
  - `pub enum LunchStatus { Marked, Auto, Pending, NoneRunning, Disabled }` (serde `camelCase`)
  - `pub struct DayCalc { pub day: NaiveDate, pub segments: Vec<Seg>, pub per_project: BTreeMap<i64, ProjectDay>, pub lunch: Option<Lunch>, pub auto_lunch: Option<AutoLunch>, pub lunch_status: LunchStatus, pub jornada_ms: i64, pub is_holiday: bool }`
  - `pub fn day_calc<Tz: TimeZone>(tz: &Tz, day: NaiveDate, today: NaiveDate, entries: &[Entry], lunches: &[Lunch], s: &Settings, now: Ms) -> DayCalc`
  - `pub fn round_ms(ms: i64, rounding_min: u32) -> i64` — nearest multiple, half rounds up; 0 = identity.
  - `pub enum Grouping { Project, Client }`
  - `pub struct Cell { pub total_ms: i64, pub extra_ms: i64 }`
  - `pub enum RowKind { ClientHeader, Data }`
  - `pub struct ReportRow { pub kind: RowKind, pub label: String, pub color: Option<String>, pub project_count: u32, pub cells: [Cell; 7], pub total: Cell }`
  - `pub struct WeekReport { pub week_start: NaiveDate, pub days: [NaiveDate; 7], pub holidays: [bool; 7], pub rows: Vec<ReportRow>, pub col_totals: [Cell; 7], pub total: Cell, pub expected_ms: i64, pub rounding_min: u32, pub grouping: Grouping }`
  - `pub fn week_report<Tz: TimeZone>(tz: &Tz, week_start: NaiveDate, today: NaiveDate, projects: &[Project], entries: &[Entry], lunches: &[Lunch], s: &Settings, now: Ms, grouping: Grouping) -> WeekReport`

Rules (spec 6.4–6.6), the algorithm the tests pin:
1. Segments of the day, each with `len = end - start`.
2. Lunch: if a `Lunch` exists for the day → status `Marked`, no deduction. Else if `lunch_min == 0` → `Disabled`. Else if `day >= today` → `Pending`. Else find the segment with `start <= ref < end` (`ref = at(day, lunch_ref)`); if found deduct `min(len, lunch_min)` from that segment's `len` → `Auto`; otherwise `NoneRunning`.
3. Overtime: walk segments in start order accumulating `len`; the part of each segment beyond `jornada_ms` is `extra` for that segment's project.
4. Week cells: per project per day `round(normal) + round(extra)`, `extra = round(extra)`. Client rows/cells, `col_totals`, row totals and `total` are sums of the rounded project values (spec 6.6). Projects with no time in the week are omitted. Rows sorted by client name, then project name; `Project` grouping emits a `ClientHeader` row before each client's projects (header cells zero). `expected_ms` = sum of `jornada_ms` over the 7 days.

- [ ] **Step 1: Write failing tests** (use `FixedOffset::east(-3h)` and helper `t("09:00")` for times on a fixed date)
  - `overtime_goes_to_project_running_after_jornada`: jornada 8h; A 08:50–12:00, B 13:00–15:00, C 15:00–19:20, lunch marked 12:00–13:00 → A normal 3h10, B normal 2h, C normal 2h50 + extra 1h30.
  - `auto_lunch_deducts_from_project_running_at_ref`: past day, no lunch marked, A 09:10–17:40, B 17:40–18:00, ref 12:00, 60 min → A total 7h30, `auto_lunch == {A, 1h}`, status `Auto`.
  - `no_auto_lunch_today`: same entries with `day == today` → status `Pending`, A total 8h30.
  - `no_auto_lunch_when_nothing_running_at_ref`: past day A 09:00–11:00, B 13:00–18:00 → `NoneRunning`, no deduction.
  - `marked_lunch_prevents_auto`: lunch present → `Marked`, no deduction.
  - `zero_jornada_all_extra`: Saturday (jornada 0) 10:00–12:30 → normal 0, extra 2h30; holiday Monday same.
  - `midnight_split`: entry 22:00 → 01:30 next day: day 1 has 2h, day 2 has 1h30.
  - `running_entry_counts_until_now`.
  - `round_ms_cases`: `round_ms(130 min, 15) == 135 min`; `round_ms(127 min, 15) == 120 min`; `round_ms(7.5 min, 15) == 15 min`; `round_ms(130 min, 30) == 120 min`; `round_ms(x, 0) == x`.
  - `week_client_grouping_sums_rounded_projects`: rounding 15; client X with P1 = 1h07 and P2 = 1h07 on Monday → each project cell 1h, client cell 2h (not round(2h14) = 2h15).
  - `week_totals_and_expected`: default settings, `expected_ms == 40h`; totals equal sum of row totals.
- [ ] **Step 2:** `cargo test calc::` → FAIL.
- [ ] **Step 3:** Implement the functions above.
- [ ] **Step 4:** `cargo test calc::` → PASS.
- [ ] **Step 5:** Commit `feat(domain): lunch, overtime, rounding and reports`.

---

### Task 4: SQLite storage

**Files:**
- Create: `src-tauri/src/store/db.rs`, `src-tauri/src/store/repo.rs`
- Test: inline tests using `Db::open_in_memory()`

**Interfaces:**
- Produces:
  - `pub struct Db { conn: rusqlite::Connection }` with `Db::open(path: &Path) -> Result<Db>`, `Db::open_in_memory() -> Result<Db>`; migrations via `PRAGMA user_version` (v1 schema below). WAL mode on file DBs.
  - Schema v1: `projects(id INTEGER PK, name TEXT NOT NULL, client TEXT NOT NULL, color TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`; `entries(id INTEGER PK, project_id INTEGER NOT NULL REFERENCES projects(id), start INTEGER NOT NULL, end INTEGER NULL)` + index on `start` and a partial unique index ensuring at most one row with `end IS NULL`; `lunches(day TEXT PK /*YYYY-MM-DD*/, start INTEGER NOT NULL, end INTEGER NOT NULL)`; `meta(key TEXT PK, value TEXT NOT NULL)` (stores `settings` JSON, `session` JSON, `heartbeat` ms, `paused` bool).
  - `repo` fns on `&Db` (all `-> Result<_, StoreError>`): `insert_project(name, client, color) -> Project`, `update_project(&Project)`, `list_projects() -> Vec<Project>`, `insert_entry(project_id, start, end: Option<Ms>) -> Entry`, `update_entry(&Entry)`, `delete_entry(id)`, `get_entry(id) -> Option<Entry>`, `open_entry() -> Option<Entry>`, `entries_between(from: Ms, to: Ms) -> Vec<Entry>` (overlapping range, includes open), `last_entries(limit) -> Vec<Entry>` (by `COALESCE(end, start)` desc), `upsert_lunch(&Lunch)`, `delete_lunch(day)`, `lunches_between(from: NaiveDate, to: NaiveDate) -> Vec<Lunch>`, `get_meta<T: DeserializeOwned>(key) -> Option<T>`, `set_meta<T: Serialize>(key, &T)`, `del_meta(key)`.
  - `pub enum StoreError` (thiserror) with `Sqlite`, `Json`.

- [ ] **Step 1: Write failing tests:** `migrates_fresh_db` (user_version == 1); `project_roundtrip`; `entries_between_includes_overlapping_and_open`; `only_one_open_entry` (second insert with `end=None` → error); `meta_roundtrip_settings` (store `Settings::default()` and read it back equal).
- [ ] **Step 2:** `cargo test store::` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test store::` → PASS.
- [ ] **Step 5:** Commit `feat(store): sqlite schema and repository`.

---

### Task 5: Tracker (clock state machine, absence, undo, heartbeat)

**Files:**
- Create: `src-tauri/src/tracker/mod.rs`, `src-tauri/src/tracker/undo.rs`
- Test: inline tests (in-memory DB, `FixedOffset` tz, explicit `now` values)

**Interfaces:**
- Consumes: Task 2–4.
- Produces:
  - `pub enum ClockStatus { Idle, Running, Paused }`
  - `pub struct Session { pub project_id: i64, pub accum_ms: i64 }` (persisted in `meta.session`; `meta.paused` bool)
  - `pub enum AbsenceReason { Idle, Sleep }`; `pub struct Absence { pub start: Ms, pub end: Ms, pub reason: AbsenceReason, pub project_id: i64 }`
  - `pub enum AbsenceResolution { Discount, Lunch, Keep, MoveTo(i64) }` (serde tagged `{ "kind": "...", "projectId"?: n }`)
  - `pub struct RecentProject { pub project: Project, pub today_ms: i64, pub shortcut: Option<u8> }`
  - `pub struct TrackerSnapshot { pub status: ClockStatus, pub session_project: Option<Project>, pub session_ms: i64, pub running_since: Option<Ms>, pub today_ms: i64, pub today_jornada_ms: i64, pub recents: Vec<RecentProject>, pub projects: Vec<Project>, pub pending_absence: Option<Absence>, pub can_undo: bool, pub notice: Option<String> }`
  - `pub enum TrackerError { Store(StoreError), NotFound, InvalidRange, Overlap, NoSession }` with pt-BR `Display` messages (`"O início precisa ser antes do fim"`, `"Esse horário sobrepõe outro registro"`, ...).
  - `pub struct Tracker { db: Db, pending: Option<Absence>, undo: Option<UndoLog>, notice: Option<String> }` with:
    - `new(db: Db) -> Tracker`; `settings() -> Settings`; `set_settings(Settings)`
    - `switch_to(pid, now)`, `pause(now)`, `resume(now)`, `stop(now)` (undoable)
    - `begin_absence(start, end, reason) -> bool` — only when Running; stores `pending`; returns whether a prompt is needed. If `reason == Sleep && settings.stop_on_sleep` → closes entry at `start`, ends session, returns false, sets `notice`.
    - `resolve_absence(AbsenceResolution, now)` (undoable) — semantics of spec 6.3; `Lunch` upserts the lunch of `local_day(start)`.
    - `undo()` — one level; restores touched entry rows, lunches and session/paused exactly.
    - `heartbeat(now)` — writes `meta.heartbeat` when Running.
    - `reconcile_on_startup(now) -> Option<Ms>` — if an entry is open and `now - heartbeat > 120_000`, close it at `heartbeat` (or at its start if no heartbeat), end session, set `notice` "O relógio foi parado às HH:MM, quando o app fechou", make it undoable (undo reopens it), return the close time.
    - `quit(now)` — if `pending` exists close at `pending.start`, else close at `now`; end session.
    - `create_project(name, client, color) -> Project`, `update_project(Project)`, `add_entry(pid, start, end)`, `update_entry(id, start: Option<Ms>, end: Option<Ms>, project_id: Option<i64>)`, `delete_entry(id)` (undoable), `unmark_lunch(day)` (undoable). Range/overlap validation on add/update (open entry counts as ending at `now`).
    - `snapshot<Tz: TimeZone>(&self, tz, now) -> TrackerSnapshot` — recents: up to 4 distinct non-archived projects by latest `COALESCE(end, now)`, padded with other active projects by name; `shortcut` 1..=4 in order; `today_ms` raw (no lunch deduction) for today.
    - `week_report(tz, week_start, now, grouping)` and `day_calc(tz, day, now)` delegating to `calc`.

- [ ] **Step 1: Write failing tests:**
  - `switch_closes_previous_and_starts_new_session`.
  - `pause_resume_keeps_session_time`: run 10:00–10:30, pause, resume 10:45, now 11:00 → `session_ms == 45 min`, two entries, status Running.
  - `stop_is_undoable`.
  - `absence_discount`: running since 09:00, absence 12:05–13:10 Discount → entries 09:00–12:05 and open from 13:10; session continues.
  - `absence_lunch_marks_lunch` (lunch day row 12:05–13:10).
  - `absence_keep_changes_nothing`.
  - `absence_move_to_other_project` → middle entry belongs to the other project.
  - `absence_ignored_when_paused_or_idle` (`begin_absence` returns false).
  - `sleep_with_stop_on_sleep_closes_at_sleep_start`.
  - `reconcile_closes_at_heartbeat_after_two_minutes` and `reconcile_keeps_running_under_two_minutes`.
  - `quit_with_pending_absence_closes_at_absence_start` (Review Focus 5).
  - `update_entry_rejects_inverted_range` and `update_entry_rejects_overlap` (Review Focus 4), data unchanged after error.
  - `recents_order_and_shortcuts`.
- [ ] **Step 2:** `cargo test tracker::` → FAIL.
- [ ] **Step 3:** Implement. `UndoLog` = list of inverse ops (`RestoreEntry(Entry)`, `DeleteEntry(i64)`, `RestoreLunch(Lunch)`, `DeleteLunch(NaiveDate)`, `RestoreSession(Option<Session>, bool)`) recorded during the operation; any new undoable op replaces it; non-undoable mutations clear it.
- [ ] **Step 4:** `cargo test tracker::` → PASS.
- [ ] **Step 5:** Commit `feat(tracker): clock state machine, absence, undo, heartbeat`.

---

### Task 6: Exports (CSV and HTML)

**Files:**
- Create: `src-tauri/src/export/{mod.rs,csv.rs,html.rs}`, `src-tauri/src/i18n.rs`
- Test: inline tests

**Interfaces:**
- Consumes: `WeekReport`, `DayCalc`, `Project`, `Seg`.
- Produces:
  - `pub fn fmt_hours(ms: i64) -> String` — decimal comma, max 2 decimals, trims zeros (`5,5`, `7,25`, `8`; 0 → `0`).
  - `pub fn csv_summary(days: &[DayCalc], projects: &[Project], rounding_min: u32) -> String` — header `data;cliente;projeto;horas_normais;horas_extras;horas_total`, one row per day per project with time, rounded per spec 6.6.
  - `pub fn csv_detailed(days: &[DayCalc], projects: &[Project]) -> String` — header `data;cliente;projeto;inicio;fim;horas`, one row per segment (`HH:MM` local).
  - Both prepend UTF‑8 BOM, separator `;`, `\r\n` line ends, quote fields containing `;`, `"`, `\r` or `\n` (doubling quotes).
  - `pub fn html_report(report: &WeekReport, detailed: Option<(&[DayCalc], &[Project])>) -> String` — single self-contained light-theme document: title "Horas da semana", period, cards (Total, Jornada prevista, Hora extra), grid like the report window, "Hora extra" row, optional "Registros" table; all text HTML-escaped; `@media print` friendly.
  - `pub enum ExportFormat { Csv, Html }`; `pub fn export_week(tracker: &Tracker, tz, week_start, now, grouping, format, detailed: bool) -> String`.

- [ ] **Step 1: Write failing tests:** `fmt_hours_cases`; `csv_summary_rows_and_bom`; `csv_escapes_semicolon_and_quotes` (client `Acme; "Brasil"` → `"Acme; ""Brasil"""`); `csv_detailed_times`; `html_escapes_names` (`<script>` never appears raw); `html_contains_totals`.
- [ ] **Step 2:** `cargo test export::` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test export::` → PASS.
- [ ] **Step 5:** Commit `feat(export): csv and html week exports`.

---

### Task 7: Tauri wiring: state, commands, events, ticker

**Files:**
- Create: `src-tauri/src/commands/mod.rs`; Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/types.ts`, `src/lib/api.ts`
- Test: `src-tauri/src/commands/mod.rs` inline test for `report_dto` shaping; `src/lib/api.test.ts` (mocks `@tauri-apps/api/core` invoke)

**Interfaces:**
- Produces:
  - `pub struct AppState { pub tracker: Mutex<Tracker> }` managed by Tauri; DB at `app_data_dir()/timewatch.sqlite3`.
  - After every mutating command: emit `tracker://changed` with `TrackerSnapshot` to all windows.
  - Commands (names exactly): `get_snapshot`, `switch_project(projectId)`, `pause_clock`, `resume_clock`, `stop_clock`, `resolve_absence(resolution)`, `undo`, `create_project(name, client, color)`, `update_project(project)`, `get_week(weekStart: string /*YYYY-MM-DD*/, grouping)` → `WeekReport`, `get_day(day)` → `DayCalc` + project list, `add_entry(projectId, start, end)`, `update_entry(id, start?, end?, projectId?)`, `delete_entry(id)`, `unmark_lunch(day)`, `get_settings`, `set_settings(settings)`, `export_week(weekStart, grouping, format, detailed, path)` (writes file), `open_window(kind)` (`report|settings|onboarding`), `overlay_set_hit_rect(rect: {x,y,w,h} | null)`, `overlay_set_expanded(expanded)`, `overlay_focus`, `finish_onboarding(projects: [{name, client}], startIndex: number | null)`.
  - Errors returned as `String` (TrackerError Display).
  - Ticker thread (1 s): emits `tracker://tick` `{ now }` to windows; every 60 s calls `heartbeat`; updates tray title (Task 10 hook `tray::update(&app, &snapshot)`).
  - On startup: `reconcile_on_startup(now)` before creating windows. On `RunEvent::ExitRequested`/tray "Sair": `quit(now)`.
  - `src/lib/types.ts` mirrors every serialized Rust type (camelCase). `src/lib/api.ts` exports one typed function per command plus `onChanged(cb)`, `onTick(cb)`, `onOverlayHover(cb)`.

- [ ] **Step 1: Write failing tests:** `api.test.ts` asserts `api.switchProject(3)` calls `invoke("switch_project", { projectId: 3 })` and `api.getWeek("2026-11-09","client")` calls `invoke("get_week", { weekStart: "2026-11-09", grouping: "client" })`.
- [ ] **Step 2:** `pnpm vitest run src/lib` → FAIL.
- [ ] **Step 3:** Implement commands, state, ticker, startup/quit hooks, TS types and API.
- [ ] **Step 4:** `pnpm vitest run src/lib` and `cargo test` → PASS; `pnpm tauri dev` starts without panics.
- [ ] **Step 5:** Commit `feat: tauri commands, events and ticker`.

---

### Task 8: Absence monitor (idle + sleep detection)

**Files:**
- Create: `src-tauri/src/absence.rs`; Modify: `src-tauri/src/platform/{mod.rs,macos/mod.rs,windows/mod.rs}`, `src-tauri/src/lib.rs`
- Test: inline tests for the pure `AbsenceMonitor`

**Interfaces:**
- Produces:
  - `platform::idle_seconds() -> f64` — macOS: FFI `CGEventSourceSecondsSinceLastEventType(0 /*CombinedSessionState*/, u32::MAX /*any input*/)` from ApplicationServices; Windows: `GetLastInputInfo` vs `GetTickCount`.
  - `pub struct AbsenceMonitor { idle_threshold_ms: i64, last_tick_wall: Ms, last_tick_mono: Duration, pending_idle_start: Option<Ms> }`
  - `pub enum MonitorEvent { Absence { start: Ms, end: Ms, reason: AbsenceReason } }`
  - `AbsenceMonitor::tick(&mut self, wall_now: Ms, mono_now: Duration, idle_ms: i64, running: bool) -> Option<MonitorEvent>`:
    - **Sleep** (decision of this plan: detected portably as a wall‑clock jump; `std::time::Instant` does not advance during sleep on macOS/Windows): if `(wall_now - last_tick_wall) - (mono_now - last_tick_mono) > 30_000` and running → `Absence { start: last_tick_wall, end: wall_now, reason: Sleep }`.
    - **Idle**: while running, when `idle_ms >= idle_threshold_ms` set `pending_idle_start = wall_now - idle_ms` (keep the earliest); when input resumes (`idle_ms < 5_000`) and pending is set → emit `Absence { start: pending, end: wall_now - idle_ms, reason: Idle }` and clear.
    - Not running → clear pending, no events.
  - Loop thread in `lib.rs`: every 5 s call `tick`; on event call `tracker.begin_absence`; if it returns true emit `tracker://changed` and call `window::expand_overlay(&app)` so the prompt shows (spec 6.3). Threshold follows settings changes.

- [ ] **Step 1: Write failing tests:** `idle_over_threshold_emits_on_return` (threshold 15 min; idle grows to 65 min then drops to 1 s → event start = first idle instant, reason Idle); `idle_under_threshold_no_event`; `sleep_gap_emits_sleep_absence`; `no_events_when_not_running`.
- [ ] **Step 2:** `cargo test absence::` → FAIL.
- [ ] **Step 3:** Implement monitor, platform idle functions, and the thread.
- [ ] **Step 4:** `cargo test absence::` → PASS. Manual: run app on macOS, start a project, set idle threshold to 5 min in DB/settings, wait without input, move the mouse → prompt appears.
- [ ] **Step 5:** Commit `feat: idle and sleep absence detection`.

---

### Task 9: Overlay window (notch) and platform integration

**Files:**
- Create/Modify: `src-tauri/src/window/mod.rs`, `src-tauri/src/platform/{mod.rs,macos/mod.rs,windows/mod.rs}`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`
- Test: inline tests for pure geometry fns

**Interfaces:**
- Produces:
  - `pub struct NotchInfo { pub width: f64, pub height: f64 }`; `platform::notch_info(monitor) -> Option<NotchInfo>` — macOS via `NSScreen.safeAreaInsets.top > 0` and `auxiliaryTopLeftArea`/`auxiliaryTopRightArea` (notch width = screen width − both areas); `None` elsewhere.
  - `platform::make_overlay(window: &WebviewWindow)` — macOS: convert to non-activating `NSPanel` with tauri-nspanel (`v2.1`), level above main menu, collection behavior `canJoinAllSpaces | stationary | fullScreenAuxiliary | ignoresCycle`, no shadow; Windows: extended styles `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST` via `SetWindowLongPtrW`.
  - `pub fn overlay_frame(monitor_pos, monitor_size, scale, notch: Option<NotchInfo>) -> (x, y, w, h)` — fixed window of logical 520×640 centered horizontally at the monitor top (y = monitor top); returns `PillMode::Notch` (pill fits the notch, 32 px tall, at least notch width) or `PillMode::Strip` (collapsed strip 6 px tall, 160 px wide) — `pub enum PillMode { Notch, Strip }`, sent to the frontend in `overlay://config` `{ mode, notchWidth }`.
  - Window manager: `create_overlay(app)` (label `notch`, url `index.html?view=notch`, transparent, no decorations, not resizable, skip taskbar, always on top, not focusable, `ignore_cursor_events(true)` initially); `reposition_overlay(app)` on monitor changes (polled every 2 s by comparing monitor list; picks `settings.overlay_monitor` by name or primary); `expand_overlay(app)` / `collapse_overlay(app)` emit `overlay://expanded` bool.
  - Click-through: frontend reports its interactive rect via `overlay_set_hit_rect` (logical px relative to the window). A 33 ms polling thread reads `app.cursor_position()`; inside rect → `set_ignore_cursor_events(false)` and emit `overlay://hover true`, outside → `true` and `overlay://hover false` (only on transitions). This also drives hover open/close since the transparent window cannot get `mouseenter` while ignoring events.
  - Keyboard focus: the overlay never takes focus on hover. `focus_overlay(app)` (used by the global shortcut and by clicking the search field via command `overlay_focus`) makes the panel key window (macOS `panel.make_key_window()`; Windows `SetForegroundWindow`); `overlay_set_expanded(false)` resigns it.
  - `create_or_focus(app, kind)` for `report` (1020×720), `settings` (780×600), `onboarding` (640×560, centered, not resizable) — normal decorated windows.

- [ ] **Step 1: Write failing tests:** `frame_centered_on_primary` (monitor at (0,0) 1512×982 scale 2 → x = (1512−520)/2); `frame_on_secondary_monitor_offset`; `pill_mode_notch_when_notch_present`; `pill_mode_strip_without_notch`.
- [ ] **Step 2:** `cargo test window::` → FAIL.
- [ ] **Step 3:** Implement geometry, window creation, platform functions, click-through polling, monitor polling.
- [ ] **Step 4:** `cargo test window::` → PASS. Manual on macOS (record results in the commit message body): pill visible in the notch; hovering opens without stealing focus from a text editor you're typing in; works over a fullscreen app and on every Space; clicks pass through the transparent area; unplugging/plugging an external monitor repositions it.
- [ ] **Step 5:** Commit `feat: notch overlay window with click-through and platform integration`.

---

### Task 10: Tray, global shortcut, autostart

**Files:**
- Create: `src-tauri/src/tray/mod.rs`; Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, capabilities
- Test: inline test for `tray_title(&TrackerSnapshot) -> Option<String>`

**Interfaces:**
- Produces:
  - Tray icon (template image on macOS). Left click toggles overlay expanded (pinned). Menu: "Abrir", "Ver semana", "Configurações", separator, "Sair" (calls `tracker.quit(now)` then `app.exit(0)`).
  - `pub fn tray_title(s: &TrackerSnapshot) -> Option<String>` — Running: `"H:MM"` of session; Paused: `"pausado"`; Idle: `None`. macOS sets it as title; Windows sets tooltip `"Timewatch · <projeto> · H:MM"`.
  - Global shortcut from `settings.shortcut` (re-registered when settings change; invalid shortcut → keep previous and return error from `set_settings`): expands overlay, focuses it, emits `overlay://focus-search`.
  - Autostart enabled/disabled to match `settings.autostart` at startup and on change.
  - macOS: `ActivationPolicy::Accessory` (no Dock icon) except while report/settings/onboarding windows are open (switch to `Regular` so they can be focused/⌘-tabbed; back to Accessory when the last closes).

- [ ] **Step 1: Write failing test** `tray_title_states` (Running 1h05m → `"1:05"`, Paused → `"pausado"`, Idle → None).
- [ ] **Step 2:** `cargo test tray::` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test tray::` → PASS. Manual: tray shows time; menu items open windows; ⌥Space opens the overlay with the search focused; "Sair" closes the running entry at that minute.
- [ ] **Step 5:** Commit `feat: tray, global shortcut, autostart`.

---

### Task 11: UI kit and design tokens

**Files:**
- Create: `src/styles/index.css` (tokens), `src/lib/format.ts`, `src/i18n/pt-BR.ts`, `src/components/ui/{Button,Popover,Dropdown,TimePicker,Calendar,Toggle,Stepper,Segmented,ColorPicker,Toast}.tsx`, `src/stores/toast.ts`
- Test: `src/lib/format.test.ts`, `src/components/ui/*.test.tsx`

**Interfaces:**
- Produces:
  - Tokens as CSS variables + Tailwind theme: `--bg #0c0d11`, `--panel #0a0a0c`, `--win #131318`, `--raise #1b1b21`, `--raise2 #23232b`, `--line #2a2a33`, `--text #ececf1`, `--mute #8a8a96`, `--dim #5d5d68`, `--accent #4f86ff`, `--accent2 #a8c4ff`.
  - `format.ts`: `dec(ms): string` (same rules as Rust `fmt_hours`, empty string for 0), `dur(ms): string` (`"5h 40m"`, `"45m"`, `"2h"`), `clock(ms): string` (`"2:14:07"`), `dayLabel(date): string` (`"10 nov"`), `weekdayShort(i)` (`Seg..Dom`).
  - Components (controlled, keyboard accessible, Framer Motion for open/close):
    - `Popover({ anchor, open, onClose, children })` — portal, flips above when no room, closes on outside click and Esc.
    - `Dropdown<T>({ value, options: {value: T, label, color?, group?}[], onChange, renderValue? })`.
    - `TimePicker({ value: "HH:MM", onChange })` — two scrolling columns (00–23, 00–59) and OK; keyboard: arrows change, Enter confirms.
    - `Calendar({ month, selected: string[], onToggle(day: string) })` — Monday-first grid, month nav.
    - `Toggle({ checked, onChange, label })` (role `switch`), `Stepper({ value, step, min, max, format, onChange })`, `Segmented<T>({ value, options, onChange })` (role `radiogroup`), `ColorPicker({ value, colors, onChange })`.
    - `Button({ variant: "primary" | "secondary" | "ghost", size?: "sm" })`; primary = accent bg + white text.
    - `Toast` host + `toast(message, { undo?: () => void })` store; 2.4 s, 5 s with undo.
  - Project palette: `["#3ddc84","#5aa9ff","#ffb347","#c08bff","#ff6b8b","#4dd6d6","#e6e04f","#ff8f5a","#9be15d","#7c9cff","#f78fb3","#b0b0bb"]` (identity dots only).

- [ ] **Step 1: Write failing tests:** `format.test.ts` (`dec(5.5h)=="5,5"`, `dec(7.25h)=="7,25"`, `dec(0)==""`, `dur(5h40m)=="5h 40m"`, `clock(8047000)=="2:14:07"`); `Stepper` clamps to min/max; `Segmented` calls onChange with the clicked value and has `role=radiogroup`; `Toggle` has `role=switch` and toggles on Space; `TimePicker` emits `"10:05"` after choosing 10 and 05 and OK; `Dropdown` opens on click, selects with Enter; `Calendar` calls `onToggle("2026-11-20")`.
- [ ] **Step 2:** `pnpm vitest run src/components/ui src/lib` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS. Also grep the codebase: `rg "<select|type=\"(checkbox|radio|time|date|number)\"" src` returns nothing.
- [ ] **Step 5:** Commit `feat(ui): design tokens and custom controls`.

---

### Task 12: Notch UI

**Files:**
- Create: `src/stores/tracker.ts`, `src/components/notch/{NotchApp,Pill,Panel,DayProgress,ProjectSearch,AllProjects,CreateProject,AbsencePrompt}.tsx`
- Test: `src/components/notch/*.test.tsx`, `src/stores/tracker.test.ts`

**Interfaces:**
- Consumes: `api.ts`, UI kit, `overlay://config|hover|expanded|focus-search` events.
- Produces: the overlay view (spec 7.1–7.2), matching the prototype:
  - `useTracker` Zustand store: `snapshot`, `now` (from `tracker://tick`), `sessionMs` derived (`snapshot.sessionMs + (running ? now - runningSince : 0)`).
  - `Pill`: Running (dot, project name, session clock), Paused (pause icon, dimmed name, frozen clock in accent2), Idle ("Sem projeto rodando"). In `Strip` mode collapsed renders a 160×6 bar in the project color (or `--dim`), growing to the pill on hover.
  - `Panel` (opens on `overlay://hover true` after 0 ms, closes 450 ms after hover false unless pinned; click pins; Esc / outside click unpins): header (client · project, "pausado" chip, big clock), round buttons pause/resume (resume is white with dark icon) and stop, `DayProgress` (normal in accent, extra in accent2, "Hoje Xh Ym" / "jornada Nh" or "dia sem jornada, tudo é extra"), search field ("Trocar para… ou criar projeto"), recents with today time and `1`–`4` badges, "Todos os projetos", footer "Ver horas da semana" / "Configurações".
  - `ProjectSearch`: case-insensitive match on name + client; Enter picks first; last row "＋ Criar projeto “texto”".
  - `CreateProject`: name, client chips + free text, color, "Criar e iniciar".
  - `AbsencePrompt` replaces the panel while `snapshot.pendingAbsence` exists: title "Você ficou fora das HH:MM às HH:MM", buttons Descontar / Foi o almoço / Manter, chips to move to other projects.
  - Keyboard (panel open, not typing): `1`–`4` switch, Space pause/resume, Esc close.
  - Reports hit rect after every layout change via `ResizeObserver` → `overlay_set_hit_rect`; collapsed rect = pill/strip bounds.
  - Toast after actions; undo calls `api.undo()`.

- [ ] **Step 1: Write failing tests:** `ProjectSearch` filters "sap" to "Migração SAP" and offers create row; Enter calls `switchProject` with first id; panel Space key calls `pauseClock` when running and `resumeClock` when paused; `AbsencePrompt` "Foi o almoço" calls `resolveAbsence({kind:"lunch"})`; `sessionMs` derivation test in store.
- [ ] **Step 2:** `pnpm vitest run src/components/notch src/stores` → FAIL.
- [ ] **Step 3:** Implement with Framer Motion spring (`stiffness 420, damping 32`) for pill→panel.
- [ ] **Step 4:** → PASS. Manual on macOS: full flow switch/pause/resume/stop/search/create; absence prompt via shortened threshold.
- [ ] **Step 5:** Commit `feat(notch): overlay UI`.

---

### Task 13: Report window (week and day)

**Files:**
- Create: `src/components/report/{ReportApp,WeekView,DayView,Timeline,EntryRow,ExportMenu}.tsx`
- Test: `src/components/report/*.test.tsx`

**Interfaces:**
- Consumes: `get_week`, `get_day`, entry commands, `export_week`, dialog plugin `save()`, clipboard plugin `writeText`.
- Produces (spec 7.4):
  - `WeekView`: ‹ week ›, "Esta semana" (when not current), Segmented "Por projeto / Por cliente", "Exportar ▾", cards (Total trabalhado, Jornada prevista, Hora extra), grid (day headers with "feriado" tag, client header rows, cells `dec(total)` + "+x extra", Total row, "Hora extra" row), empty state "Nada registrado nesta semana.", hint text. Click a number → copy `dec(value)` and toast "5,5 copiado". Click a day header → DayView replaces content.
  - `DayView`: "‹ Semana", ‹ day ›, "+ Adicionar registro" (1h block after the last entry, default project = first recent), cards (Total, Jornada [feriado], Hora extra), `Timeline` (blocks by project color, hatched lunch, "now" marker in white for today), `EntryRow` (TimePicker start/end, Dropdown project, duration, delete with undo; running entry shows "agora" chip), lunch row with unmark, lunch note text per `lunchStatus`.
  - `ExportMenu`: CSV / HTML + Toggle "Detalhar início e fim de cada registro"; opens save dialog with default name `horas_<YYYY-MM-DD>.csv|html`, then `export_week`.
  - Live refresh on `tracker://changed` and every 15 s tick.
  - Errors from commands shown as toast text.

- [ ] **Step 1: Write failing tests** (mock api): clicking a cell copies `"5,5"`; clicking "Qua" header renders DayView for that date; Segmented "Por cliente" refetches with `grouping: "client"`; changing an EntryRow end time calls `updateEntry(id, undefined, <ms>)`; an `update_entry` rejection shows its message.
- [ ] **Step 2:** `pnpm vitest run src/components/report` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS. Manual: export both formats and open them (CSV in Numbers/Excel shows accents and decimals correctly).
- [ ] **Step 5:** Commit `feat(report): week and day views, export`.

---

### Task 14: Settings window

**Files:**
- Create: `src/components/settings/{SettingsApp,GeneralSection,WorkdaySection,LunchSection,AbsenceSection,ProjectsSection,JornadaEditor}.tsx`
- Test: `src/components/settings/*.test.tsx`

**Interfaces:**
- Produces (spec 6.7 / 7.5): side nav (Geral, Jornada e extras, Almoço, Ausência, Projetos). Every change calls `set_settings` immediately (no save button).
  - Geral: rounding Segmented (Exato/15 min/30 min), autostart Toggle, shortcut recorder (click, press combo, shows e.g. `⌥ Space`), overlay monitor Dropdown (from `availableMonitors()`; "Tela principal" default).
  - Jornada: `JornadaEditor` (7 Steppers step 0.5, 0–24; presets Seg–Sex 8h/6h/4h), holidays Calendar popover + removable chips.
  - Almoço: Stepper 0–180 step 15, TimePicker reference.
  - Ausência: Stepper 5–120 step 5, Toggle "Parar o relógio ao fechar o notebook" with the monitor limitation note ("Com monitor externo o Mac pode não entrar em repouso").
  - Projetos: add (client + project, Enter), color via ColorPicker, archive Toggle, rename inline.
  - `JornadaEditor` is exported for reuse by onboarding.

- [ ] **Step 1: Write failing tests:** preset "Seg–Sex 6h" calls `setSettings` with `jornadaH [6,6,6,6,6,0,0]`; Stepper "+" on lunch calls with `lunchMin 75`; archiving calls `updateProject({...p, archived: true})`.
- [ ] **Step 2:** `pnpm vitest run src/components/settings` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(settings): settings window`.

---

### Task 15: Onboarding and first run

**Files:**
- Create: `src/components/onboarding/{OnboardingApp,StepWelcome,StepProjects,StepWorkday,StepLunch,StepRounding,StepStart}.tsx`; Modify: `src-tauri/src/lib.rs` (open onboarding when `!settings.onboarded`)
- Test: `src/components/onboarding/OnboardingApp.test.tsx`

**Interfaces:**
- Produces (spec 7.6): 6 steps with progress dots; Welcome ("Saiba pra onde vão suas horas", "Configurar (1 min)", "Pular"); Projects (client + project inputs, Enter adds, client chips, ≥1 to continue); Workday (`JornadaEditor`); Lunch (Segmented Não descontar/30 min/1h/1h30 + TimePicker "Costumo almoçar por volta de"); Rounding (Segmented + live example: 2h10 → `2,25` with 15, `2` with 30, `2,17` exact); Start (list of created projects → start one, or "Nenhum agora, só quero explorar").
  - Finishing calls `finish_onboarding(projects, startIndex)`: Rust creates projects, sets `onboarded = true`, optionally switches, closes the onboarding window, expands the overlay and emits `overlay://coach` → notch shows the coach bubble "Seu relógio mora aqui. Passe o mouse pra trocar de projeto, ou use ⌥ Space de qualquer lugar." for 7 s.
  - "Pular" sets `onboarded = true` with no data and closes.

- [ ] **Step 1: Write failing tests:** cannot continue from Projects with zero projects; Enter in project field adds `{client:"Acme", name:"Migração SAP"}` and keeps client text; rounding example shows `2,25` when 15 selected; finishing with project index 0 calls `finishOnboarding([...], 0)`.
- [ ] **Step 2:** `pnpm vitest run src/components/onboarding` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS. Manual: delete the DB, launch, complete onboarding, see coach bubble.
- [ ] **Step 5:** Commit `feat(onboarding): first run flow`.

---

### Task 16: Windows build, CI and docs

**Files:**
- Create: `.github/workflows/build.yml`, `README.md`, `docs/ARCHITECTURE.md`
- Modify: `src-tauri/src/platform/windows/mod.rs` if CI exposes compile errors

**Interfaces:**
- Produces:
  - Workflow on push/PR: matrix `macos-latest` (target `universal-apple-darwin`) and `windows-latest`; steps: pnpm install, `pnpm vitest run`, `cargo test` (in `src-tauri`), `pnpm tauri build`; upload bundles as artifacts. Tag `v*` → draft GitHub release via `tauri-apps/tauri-action`.
  - README (pt-BR): what it is, screenshots placeholder list, install (unsigned: macOS right-click → Abrir / `xattr -dr com.apple.quarantine`; Windows SmartScreen "Mais informações → Executar assim mesmo"), dev setup (`pnpm i`, `pnpm tauri dev`), tests, build, data location, privacy (local only).
  - ARCHITECTURE.md: module map, event/command list, overlay click-through design, absence detection design (idle FFI + wall-clock gap), known limitations: lid close with external monitor on macOS; Windows has no notch (strip mode); Alt+Space conflicts with Windows window menu (configurable); unsigned builds; Windows behavior verified only in CI unless tested on a Windows machine.

- [ ] **Step 1:** Locally: `rustup target add x86_64-pc-windows-msvc && cd src-tauri && cargo check --target x86_64-pc-windows-msvc`. Expected: compiles (if a native build script blocks cross-checking, note it and rely on CI).
- [ ] **Step 2:** Write workflow and docs.
- [ ] **Step 3:** Run full local suite: `pnpm vitest run && (cd src-tauri && cargo test) && pnpm tauri build`. Expected: all PASS and a `.app`/`.dmg` produced.
- [ ] **Step 4:** Commit `ci: build macOS and Windows; docs`.
