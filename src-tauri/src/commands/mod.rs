//! Tauri commands. Every mutating command emits `tracker://changed` with a fresh snapshot.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use chrono::{Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::domain::calc::{DayCalc, Grouping, WeekReport};
use crate::domain::{Entry, Ms, Project, Settings};
use crate::export::{self, ExportFormat};
use crate::tracker::{AbsenceResolution, Tracker, TrackerError, TrackerSnapshot};
use crate::tray;
use crate::window::{self, HitRect, OverlayConfig, OverlayState};

pub struct AppState {
    pub tracker: Mutex<Tracker>,
    quit_done: AtomicBool,
}

impl AppState {
    pub fn new(tracker: Tracker) -> Self {
        Self { tracker: Mutex::new(tracker), quit_done: AtomicBool::new(false) }
    }

    pub fn lock(&self) -> MutexGuard<'_, Tracker> {
        self.tracker.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Stops the clock for app exit; runs at most once.
    pub fn quit_once(&self, now: Ms) {
        if !self.quit_done.swap(true, Ordering::SeqCst) {
            let _ = self.lock().quit(now);
        }
    }
}

pub fn now_ms() -> Ms {
    Utc::now().timestamp_millis()
}

#[derive(Debug, Serialize, PartialEq)]
pub struct DayDto {
    pub day: DayCalc,
    pub projects: Vec<Project>,
}

pub fn day_dto(t: &Tracker, day: NaiveDate, now: Ms) -> Result<DayDto, TrackerError> {
    Ok(DayDto { day: t.day_calc(&Local, day, now)?, projects: t.projects()? })
}

fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| format!("Data inválida: {s}"))
}

fn parse_grouping(s: &str) -> Result<Grouping, String> {
    match s {
        "project" => Ok(Grouping::Project),
        "client" => Ok(Grouping::Client),
        _ => Err(format!("Agrupamento inválido: {s}")),
    }
}

fn parse_format(s: &str) -> Result<ExportFormat, String> {
    match s {
        "csv" => Ok(ExportFormat::Csv),
        "html" => Ok(ExportFormat::Html),
        _ => Err(format!("Formato inválido: {s}")),
    }
}

/// Runs a mutation, then emits the new snapshot after releasing the lock.
fn mutate<R>(
    app: &AppHandle,
    state: &AppState,
    f: impl FnOnce(&mut Tracker, Ms) -> Result<R, TrackerError>,
) -> Result<R, String> {
    mutate_if(app, state, f, |_, _| true)
}

/// Like `mutate`, but emits only when `should_emit(result, snapshot)` holds.
fn mutate_if<R>(
    app: &AppHandle,
    state: &AppState,
    f: impl FnOnce(&mut Tracker, Ms) -> Result<R, TrackerError>,
    should_emit: impl FnOnce(&R, &TrackerSnapshot) -> bool,
) -> Result<R, String> {
    let now = now_ms();
    let (out, snap) = {
        let mut t = state.lock();
        let out = f(&mut t, now).map_err(|e| e.to_string())?;
        let snap = t.snapshot(&Local, now).map_err(|e| e.to_string())?;
        (out, snap)
    };
    if should_emit(&out, &snap) {
        let _ = app.emit("tracker://changed", &snap);
    }
    Ok(out)
}

/// For background threads: runs a mutation and conditionally emits; errors are ignored.
pub fn emit_if<R>(
    app: &AppHandle,
    state: &AppState,
    f: impl FnOnce(&mut Tracker) -> Result<R, TrackerError>,
    should_emit: impl FnOnce(&R, &TrackerSnapshot) -> bool,
) {
    let _ = mutate_if(app, state, |t, _| f(t), |r, s| should_emit(r, s));
}

#[tauri::command]
pub fn get_snapshot(state: State<AppState>) -> Result<TrackerSnapshot, String> {
    state.lock().snapshot(&Local, now_ms()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_project(app: AppHandle, state: State<AppState>, project_id: i64) -> Result<(), String> {
    mutate(&app, &state, |t, now| t.switch_to(project_id, now))
}

#[tauri::command]
pub fn pause_clock(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    mutate(&app, &state, |t, now| t.pause(now))
}

#[tauri::command]
pub fn resume_clock(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    mutate(&app, &state, |t, now| t.resume(now))
}

#[tauri::command]
pub fn stop_clock(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    mutate(&app, &state, |t, now| t.stop(now))
}

#[tauri::command]
pub fn resolve_absence(
    app: AppHandle,
    state: State<AppState>,
    resolution: AbsenceResolution,
) -> Result<(), String> {
    mutate(&app, &state, |t, now| t.resolve_absence(&Local, resolution, now))
}

#[tauri::command]
pub fn undo(app: AppHandle, state: State<AppState>) -> Result<bool, String> {
    mutate(&app, &state, |t, now| t.undo(now))
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    state: State<AppState>,
    name: String,
    client: String,
    color: String,
) -> Result<Project, String> {
    mutate(&app, &state, |t, _| t.create_project(&name, &client, &color))
}

#[tauri::command]
pub fn update_project(app: AppHandle, state: State<AppState>, project: Project) -> Result<(), String> {
    mutate(&app, &state, |t, _| t.update_project(project))
}

#[tauri::command]
pub fn get_week(state: State<AppState>, week_start: String, grouping: String) -> Result<WeekReport, String> {
    let (ws, g) = (parse_date(&week_start)?, parse_grouping(&grouping)?);
    state.lock().week_report(&Local, ws, now_ms(), g).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_day(state: State<AppState>, day: String) -> Result<DayDto, String> {
    let d = parse_date(&day)?;
    day_dto(&state.lock(), d, now_ms()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_entry(
    app: AppHandle,
    state: State<AppState>,
    project_id: i64,
    start: Ms,
    end: Ms,
) -> Result<Entry, String> {
    mutate(&app, &state, |t, now| t.add_entry(project_id, start, end, now))
}

#[tauri::command]
pub fn update_entry(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    start: Option<Ms>,
    end: Option<Ms>,
    project_id: Option<i64>,
) -> Result<Entry, String> {
    mutate(&app, &state, |t, now| t.update_entry(id, start, end, project_id, now))
}

#[tauri::command]
pub fn delete_entry(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    mutate(&app, &state, |t, _| t.delete_entry(id))
}

#[tauri::command]
pub fn unmark_lunch(app: AppHandle, state: State<AppState>, day: String) -> Result<(), String> {
    let d = parse_date(&day)?;
    mutate(&app, &state, |t, _| t.unmark_lunch(d))
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    state.lock().settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_settings(app: AppHandle, state: State<AppState>, settings: Settings) -> Result<(), String> {
    let old = state.lock().settings().map_err(|e| e.to_string())?;
    let shortcut_changed = old.shortcut != settings.shortcut;
    // Registering first means an invalid/taken shortcut leaves both the old one and the stored settings intact.
    if shortcut_changed {
        tray::apply_shortcut(&app, Some(&old.shortcut), &settings.shortcut)?;
    }
    let autostart = settings.autostart;
    let new_shortcut = settings.shortcut.clone();
    if let Err(e) = mutate(&app, &state, |t, _| t.set_user_settings(settings)) {
        if shortcut_changed {
            let _ = tray::apply_shortcut(&app, Some(&new_shortcut), &old.shortcut);
        }
        return Err(e);
    }
    if old.autostart != autostart {
        // A login-item failure must not block saving the other settings.
        if let Err(e) = tray::apply_autostart(&app, autostart) {
            eprintln!("[settings] autostart: {e}");
        }
    }
    Ok(())
}

#[tauri::command]
pub fn export_week(
    state: State<AppState>,
    week_start: String,
    grouping: String,
    format: String,
    detailed: bool,
    path: String,
) -> Result<(), String> {
    let (ws, g, f) = (parse_date(&week_start)?, parse_grouping(&grouping)?, parse_format(&format)?);
    let content = export::export_week(&state.lock(), &Local, ws, now_ms(), g, f, detailed)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("Não foi possível salvar o arquivo: {e}"))
}

/// Project identity colors, same order as `PROJECT_PALETTE` in `ColorPicker.tsx`.
pub const PROJECT_PALETTE: [&str; 12] = [
    "#3ddc84", "#5aa9ff", "#ffb347", "#c08bff", "#ff6b8b", "#4dd6d6",
    "#e6e04f", "#ff8f5a", "#9be15d", "#7c9cff", "#f78fb3", "#b0b0bb",
];

pub fn palette_color(i: usize) -> &'static str {
    PROJECT_PALETTE[i % PROJECT_PALETTE.len()]
}

#[derive(Debug, Clone, Deserialize)]
pub struct OnboardingProject {
    pub name: String,
    pub client: String,
}

/// Pure part of finishing onboarding: one transaction (see `Tracker::finish_onboarding`).
pub fn apply_onboarding(
    t: &mut Tracker,
    projects: &[OnboardingProject],
    start_index: Option<usize>,
    now: Ms,
) -> Result<(), TrackerError> {
    let rows: Vec<(String, String, String)> = projects
        .iter()
        .enumerate()
        .map(|(i, p)| (p.name.trim().to_string(), p.client.trim().to_string(), palette_color(i).to_string()))
        .collect();
    t.finish_onboarding(&rows, start_index, now)
}

#[tauri::command]
pub async fn finish_onboarding(
    app: AppHandle,
    state: State<'_, AppState>,
    projects: Vec<OnboardingProject>,
    start_index: Option<usize>,
) -> Result<(), String> {
    mutate(&app, &state, |t, now| apply_onboarding(t, &projects, start_index, now))?;
    close_onboarding(&app);
    window::expand_overlay(&app, true);
    let _ = app.emit("overlay://coach", ());
    Ok(())
}

/// "Pular": marks onboarding done with no data and closes the window.
#[tauri::command]
pub async fn skip_onboarding(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    mutate(&app, &state, |t, _| {
        let mut s = t.settings()?;
        s.onboarded = true;
        t.set_settings(s)
    })?;
    close_onboarding(&app);
    Ok(())
}

fn close_onboarding(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("onboarding") {
        let _ = w.close();
    }
}

/// Async so window creation does not deadlock on Windows (Tauri runs sync commands on the main thread).
#[tauri::command]
pub async fn open_window(app: AppHandle, kind: String) -> Result<(), String> {
    window::create_or_focus(&app, &kind)
}

/// Frontend reports its interactive rect (logical px relative to the overlay); `None` = nothing.
#[tauri::command]
pub fn overlay_set_hit_rect(overlay: State<OverlayState>, rect: Option<HitRect>) {
    overlay.set_hit_rect(rect);
}

/// Frontend reports open/closed; closing gives keyboard focus back.
#[tauri::command]
pub fn overlay_set_expanded(app: AppHandle, overlay: State<OverlayState>, expanded: bool) {
    overlay.set_expanded(expanded);
    if !expanded {
        crate::platform::unfocus_overlay(&app);
    }
}

/// Makes the overlay take keyboard focus (search field click).
#[tauri::command]
pub async fn overlay_focus(app: AppHandle) {
    window::focus_overlay(&app);
}

/// Current pill mode, for an overlay that loaded after the last `overlay://config`.
#[tauri::command]
pub fn get_overlay_config(overlay: State<OverlayState>) -> Option<OverlayConfig> {
    overlay.config()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Db;

    #[test]
    fn day_dto_shapes_day_and_projects() {
        let mut t = Tracker::new(Db::open_in_memory().unwrap());
        t.create_project("Alpha", "Cliente", "#4f86ff").unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let dto = day_dto(&t, day, now_ms()).unwrap();
        let v = serde_json::to_value(&dto).unwrap();
        assert_eq!(v["day"]["day"], "2026-11-09");
        assert_eq!(v["projects"][0]["name"], "Alpha");
        assert!(v["day"]["perProject"].is_object());
    }

    fn op(name: &str, client: &str) -> OnboardingProject {
        OnboardingProject { name: name.into(), client: client.into() }
    }

    #[test]
    fn onboarding_creates_projects_with_palette_and_keeps_settings() {
        let mut t = Tracker::new(Db::open_in_memory().unwrap());
        let mut s = t.settings().unwrap();
        s.rounding_min = 15;
        t.set_settings(s).unwrap();
        let ps: Vec<_> = (0..13).map(|i| op(&format!("P{i}"), "Acme")).collect();
        apply_onboarding(&mut t, &ps, Some(1), 1_000).unwrap();
        let got = t.projects().unwrap();
        assert_eq!(got.len(), 13);
        assert_eq!(got[0].color, "#3ddc84");
        assert_eq!(got[11].color, "#b0b0bb");
        assert_eq!(got[12].color, "#3ddc84");
        let s = t.settings().unwrap();
        assert!(s.onboarded);
        assert_eq!(s.rounding_min, 15);
        let snap = t.snapshot(&Local, 2_000).unwrap();
        assert_eq!(snap.session_project.unwrap().name, "P1");
    }

    #[test]
    fn onboarding_failure_rolls_everything_back() {
        let mut t = Tracker::new(Db::open_in_memory().unwrap());
        let err = apply_onboarding(&mut t, &[op("A", "Acme"), op("B", "Acme")], Some(5), 1_000);
        assert!(err.is_err());
        assert!(t.projects().unwrap().is_empty());
        assert!(!t.settings().unwrap().onboarded);
        // retry with a valid index works and creates each project once
        apply_onboarding(&mut t, &[op("A", "Acme"), op("B", "Acme")], Some(0), 1_000).unwrap();
        assert_eq!(t.projects().unwrap().len(), 2);
        assert!(t.settings().unwrap().onboarded);
    }

    #[test]
    fn onboarding_without_start_leaves_clock_idle() {
        let mut t = Tracker::new(Db::open_in_memory().unwrap());
        apply_onboarding(&mut t, &[op(" A ", " Acme ")], None, 1_000).unwrap();
        assert_eq!(t.projects().unwrap()[0].name, "A");
        assert!(t.snapshot(&Local, 2_000).unwrap().session_project.is_none());
    }

    #[test]
    fn parsers_reject_garbage() {
        assert!(parse_date("2026-11-09").is_ok());
        assert!(parse_date("09/11/2026").is_err());
        assert_eq!(parse_grouping("client"), Ok(Grouping::Client));
        assert!(parse_format("pdf").is_err());
    }
}
