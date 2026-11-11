pub mod absence;
pub mod commands;
pub mod domain;
pub mod export;
pub mod i18n;
pub mod platform;
pub mod store;
pub mod tracker;
pub mod tray;
pub mod window;

use std::time::Duration;

use chrono::Local;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;

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
            // Title/tooltip only change per minute or on state changes (the listener covers those).
            if n.is_multiple_of(5) {
                tray::refresh_tray(&app);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // single-instance must be the first plugin registered.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = window::create_or_focus(app, "report");
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::focus_overlay(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init());
    let app = platform::register(builder)
        .setup(|app| {
            // Debug builds can point at a throwaway data dir (never the real DB).
            #[cfg(debug_assertions)]
            let dir = match std::env::var_os("TIMEWATCH_DATA_DIR") {
                Some(d) => std::path::PathBuf::from(d),
                None => app.path().app_data_dir()?,
            };
            #[cfg(not(debug_assertions))]
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("timewatch.sqlite3"))?;
            let mut tracker = Tracker::new(db);
            tracker.reconcile_on_startup(&Local, now_ms())?;
            app.manage(AppState::new(tracker));
            start_ticker(app.handle().clone());
            absence::start_monitor(app.handle().clone());
            // Accessory first: opening a normal window below switches back to Regular.
            // Setting Accessory after the onboarding window hid it behind other apps.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            window::create_overlay(app.handle())?;
            if !app.state::<AppState>().lock().settings()?.onboarded {
                window::create_or_focus(app.handle(), "onboarding")?;
            }
            tray::setup_tray(app.handle())?;
            tray::refresh_tray(app.handle());
            tray::apply_startup(app.handle());
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
            commands::finish_onboarding,
            commands::skip_onboarding,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        match &event {
            RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } => {
                window::sync_activation_policy(app, Some(label));
            }
            // Alt+F4 / ⌘W (default macOS Window menu) on the overlay: keep the pill alive.
            RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. }
                if window::blocks_close(label) =>
            {
                api.prevent_close();
            }
            _ => {}
        }
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
