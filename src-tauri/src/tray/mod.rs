//! Tray icon, global shortcut and autostart.

use std::sync::Mutex;

use chrono::Local;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::commands::{now_ms, AppState};
use crate::i18n::{fill, Lang};
use crate::tracker::{ClockStatus, TrackerSnapshot};
use crate::window::{self, OverlayState};

const TRAY_ID: &str = "main";

/// Menu-bar title: `H:MM` while running, `pausado` (in `lang`) while paused, nothing when idle.
pub fn tray_title(s: &TrackerSnapshot, lang: Lang) -> Option<String> {
    match s.status {
        ClockStatus::Running => Some(format_hm(s.session_ms)),
        ClockStatus::Paused => Some(lang.strings().tray_paused.to_string()),
        ClockStatus::Idle => None,
    }
}

fn format_hm(ms: i64) -> String {
    let minutes = ms.max(0) / 60_000;
    format!("{}:{:02}", minutes / 60, minutes % 60)
}

/// Tooltip (Windows): `Timewatch · <projeto> · H:MM`; plain `Timewatch` when idle.
pub fn tray_tooltip(s: &TrackerSnapshot, lang: Lang) -> String {
    match (tray_title(s, lang), &s.session_project) {
        (Some(t), Some(p)) => format!("Timewatch \u{b7} {} \u{b7} {t}", p.name),
        (Some(t), None) => format!("Timewatch \u{b7} {t}"),
        (None, _) => "Timewatch".to_string(),
    }
}

/// Last values pushed to the tray, so unchanged ticks do not touch the OS.
static LAST_TRAY: Mutex<Option<(Option<String>, String)>> = Mutex::new(None);

/// Pushes the title (macOS) / tooltip to the tray icon. Call without holding the AppState lock.
pub fn update_tray(app: &AppHandle, s: &TrackerSnapshot, lang: Lang) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let cur = (tray_title(s, lang), tray_tooltip(s, lang));
    let mut last = LAST_TRAY.lock().unwrap_or_else(|p| p.into_inner());
    if last.as_ref() == Some(&cur) {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = tray.set_title(cur.0.as_deref());
    let _ = tray.set_tooltip(Some(cur.1.as_str()));
    *last = Some(cur);
}

/// Refreshes the tray from the current tracker state (builds the snapshot, then releases the lock).
pub fn refresh_tray(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let (snap, lang) = {
        let t = state.lock();
        (t.snapshot(&Local, now_ms()), t.lang())
    };
    if let Ok(snap) = snap {
        update_tray(app, &snap, lang);
    }
}

/// Left click: collapse the overlay if expanded, else expand it (pinned).
fn toggle_overlay(app: &AppHandle) {
    let expanded = app
        .try_state::<OverlayState>()
        .is_some_and(|s| s.is_expanded());
    if expanded {
        window::collapse_overlay(app);
    } else {
        window::expand_overlay(app, true);
    }
}

/// Tray menu labels: open, week, settings, quit.
pub fn menu_labels(lang: Lang) -> [&'static str; 4] {
    let t = lang.strings();
    [t.tray_open, t.tray_week, t.tray_settings, t.tray_quit]
}

fn build_menu(app: &AppHandle, lang: Lang) -> tauri::Result<Menu<tauri::Wry>> {
    let [open, week, settings, quit] = menu_labels(lang);
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let week = MenuItem::with_id(app, "week", week, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &open,
            &week,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

/// Rebuilds the tray menu in `lang` and refreshes the title (the paused label is translated).
pub fn set_language(app: &AppHandle, lang: Lang) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, lang)) {
        let _ = tray.set_menu(Some(menu));
    }
    refresh_tray(app);
}

pub fn setup_tray(app: &AppHandle, lang: Lang) -> tauri::Result<TrayIcon> {
    let menu = build_menu(app, lang)?;
    let icon = Image::from_bytes(include_bytes!("../../icons/tray/tray.png"))?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Timewatch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => window::expand_overlay(app, true),
            "week" => {
                let _ = window::create_or_focus(app, "report");
            }
            "settings" => {
                let _ = window::create_or_focus(app, "settings");
            }
            // A real exit: `quit_once` in the run loop closes the running entry exactly once.
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = ev
            {
                toggle_overlay(tray.app_handle());
            }
        })
        .build(app)?;
    // Immediate refresh on every tracker change; the ticker covers the passing minutes.
    let handle = app.clone();
    app.listen("tracker://changed", move |_| refresh_tray(&handle));
    Ok(tray)
}

/// Parses `"Alt+Space"`-style strings.
pub fn parse_shortcut(s: &str, lang: Lang) -> Result<Shortcut, String> {
    s.parse::<Shortcut>()
        .map_err(|e| fill(lang.strings().err_invalid_shortcut, &[s, &e.to_string()]))
}

/// Makes `new` the global shortcut. `old` stays registered if `new` is invalid or unavailable.
pub fn apply_shortcut(
    app: &AppHandle,
    old: Option<&str>,
    new: &str,
    lang: Lang,
) -> Result<(), String> {
    let new_sc = parse_shortcut(new, lang)?;
    let old_sc = old.and_then(|o| parse_shortcut(o, lang).ok());
    if old_sc.as_ref() == Some(&new_sc) && app.global_shortcut().is_registered(new_sc) {
        return Ok(());
    }
    app.global_shortcut()
        .register(new_sc)
        .map_err(|e| fill(lang.strings().err_register_shortcut, &[new, &e.to_string()]))?;
    if let Some(o) = old_sc.filter(|o| *o != new_sc) {
        let _ = app.global_shortcut().unregister(o);
    }
    Ok(())
}

/// Login items are only touched in release builds, or in debug builds that opt in.
pub fn autostart_allowed(debug: bool, opt_in: bool) -> bool {
    !debug || opt_in
}

/// Brings the OS login item in line with `enabled`.
pub fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    // Dev runs must not install a login item for the debug binary unless asked.
    if !autostart_allowed(
        cfg!(debug_assertions),
        std::env::var_os("TIMEWATCH_DEV_AUTOSTART").is_some(),
    ) {
        eprintln!("[tray] autostart change skipped (debug build)");
        return Ok(());
    }
    let mgr = app.autolaunch();
    let current = mgr.is_enabled().map_err(|e| e.to_string())?;
    if current == enabled {
        return Ok(());
    }
    if enabled { mgr.enable() } else { mgr.disable() }.map_err(|e| e.to_string())
}

/// Startup: register the stored shortcut and sync autostart (failures are logged, not fatal).
pub fn apply_startup(app: &AppHandle) {
    let Some((settings, lang)) = app.try_state::<AppState>().and_then(|s| {
        let t = s.lock();
        t.settings().ok().map(|st| (st, t.lang()))
    }) else {
        return;
    };
    match apply_shortcut(app, None, &settings.shortcut, lang) {
        Ok(()) => eprintln!("[tray] global shortcut registered: {}", settings.shortcut),
        Err(e) => eprintln!("[tray] {e}"),
    }
    match apply_autostart(app, settings.autostart) {
        Ok(()) => eprintln!("[tray] autostart set to {}", settings.autostart),
        Err(e) => eprintln!("[tray] autostart: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(status: ClockStatus, session_ms: i64) -> TrackerSnapshot {
        TrackerSnapshot {
            status,
            session_project: None,
            session_ms,
            running_since: None,
            today_ms: 0,
            today_jornada_ms: 0,
            recents: vec![],
            projects: vec![],
            pending_absence: None,
            can_undo: false,
            notice: None,
            notice_key: None,
            last_closed_entry: None,
        }
    }

    #[test]
    fn autostart_gate() {
        assert!(autostart_allowed(false, false));
        assert!(autostart_allowed(false, true));
        assert!(autostart_allowed(true, true));
        assert!(!autostart_allowed(true, false));
    }

    #[test]
    fn tray_title_states() {
        let p = Lang::PtBr;
        assert_eq!(
            tray_title(&snap(ClockStatus::Running, 65 * 60_000), p),
            Some("1:05".into())
        );
        assert_eq!(
            tray_title(&snap(ClockStatus::Running, 59_000), p),
            Some("0:00".into())
        );
        assert_eq!(
            tray_title(&snap(ClockStatus::Paused, 65 * 60_000), p),
            Some("pausado".into())
        );
        assert_eq!(tray_title(&snap(ClockStatus::Idle, 0), p), None);
    }

    #[test]
    fn tray_title_paused_per_language() {
        assert_eq!(
            tray_title(&snap(ClockStatus::Paused, 0), Lang::En),
            Some("paused".into())
        );
        assert_eq!(
            tray_title(&snap(ClockStatus::Paused, 0), Lang::Es),
            Some("en pausa".into())
        );
    }

    #[test]
    fn menu_labels_per_language() {
        assert_eq!(
            menu_labels(Lang::PtBr),
            ["Abrir", "Ver semana", "Configurações", "Sair"]
        );
        assert_eq!(
            menu_labels(Lang::En),
            ["Open", "View week", "Settings", "Quit"]
        );
        assert_eq!(
            menu_labels(Lang::Es),
            ["Abrir", "Ver semana", "Configuración", "Salir"]
        );
    }
}
