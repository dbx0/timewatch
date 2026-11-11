//! Tauri commands. Every mutating command emits `tracker://changed` with a fresh snapshot.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use chrono::{Local, NaiveDate, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::domain::calc::{DayCalc, Grouping, WeekReport};
use crate::domain::{Entry, Ms, Project, Settings};
use crate::export::{self, ExportFormat};
use crate::tracker::{AbsenceResolution, Tracker, TrackerError, TrackerSnapshot};

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
    let now = now_ms();
    let (out, snap) = {
        let mut t = state.lock();
        let out = f(&mut t, now).map_err(|e| e.to_string())?;
        let snap = t.snapshot(&Local, now).map_err(|e| e.to_string())?;
        (out, snap)
    };
    let _ = app.emit("tracker://changed", &snap);
    Ok(out)
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
    mutate(&app, &state, |t, _| t.set_settings(settings))
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

#[tauri::command]
pub fn open_window(app: AppHandle, kind: String) -> Result<(), String> {
    crate::window::create_or_focus(&app, &kind)
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

    #[test]
    fn parsers_reject_garbage() {
        assert!(parse_date("2026-11-09").is_ok());
        assert!(parse_date("09/11/2026").is_err());
        assert_eq!(parse_grouping("client"), Ok(Grouping::Client));
        assert!(parse_format("pdf").is_err());
    }
}
