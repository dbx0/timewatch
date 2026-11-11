pub mod absence;
pub mod commands;
pub mod domain;
pub mod export;
pub mod i18n;
pub mod platform;
pub mod store;
pub mod tracker;
pub mod window;

use std::time::Duration;

use chrono::Local;
use tauri::{Emitter, Manager, RunEvent};

use commands::{now_ms, AppState};
use store::Db;
use tracker::Tracker;

fn start_ticker(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut n: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            n += 1;
            let now = now_ms();
            if n.is_multiple_of(60) {
                let state = app.state::<AppState>();
                let _ = state.lock().heartbeat(now);
            }
            let _ = app.emit("tracker://tick", serde_json::json!({ "now": now }));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = platform::register(tauri::Builder::default());
    let app = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = window::create_or_focus(app, "report");
        }))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("timewatch.sqlite3"))?;
            let mut tracker = Tracker::new(db);
            tracker.reconcile_on_startup(&Local, now_ms())?;
            app.manage(AppState::new(tracker));
            start_ticker(app.handle().clone());
            absence::start_monitor(app.handle().clone());
            // Task 15 adds onboarding.
            window::create_overlay(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::switch_project,
            commands::pause_clock,
            commands::resume_clock,
            commands::stop_clock,
            commands::resolve_absence,
            commands::undo,
            commands::create_project,
            commands::update_project,
            commands::get_week,
            commands::get_day,
            commands::add_entry,
            commands::update_entry,
            commands::delete_entry,
            commands::unmark_lunch,
            commands::get_settings,
            commands::set_settings,
            commands::export_week,
            commands::open_window,
            commands::overlay_set_hit_rect,
            commands::overlay_set_expanded,
            commands::overlay_focus,
            commands::get_overlay_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        let quitting = match &event {
            // Last normal window closed (`code` None): keep running in the background.
            RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
                false
            }
            RunEvent::ExitRequested { .. } | RunEvent::Exit => true,
            _ => false,
        };
        if quitting {
            if let Some(state) = app.try_state::<AppState>() {
                state.quit_once(now_ms());
            }
        }
    });
}
