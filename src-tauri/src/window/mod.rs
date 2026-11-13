//! Window creation helpers: the notch overlay and the normal app windows.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::commands::{current_lang, AppState};
use crate::i18n::{fill, Lang};
use crate::platform::{self, NotchInfo};

pub mod intent;

pub const OVERLAY_LABEL: &str = "notch";
/// Fixed overlay window size, logical px.
pub const OVERLAY_W: f64 = 520.0;
pub const OVERLAY_H: f64 = 640.0;
/// Notch mode: extra pill width on each side of the notch (dot+project left, timer right).
pub const PILL_EAR: f64 = 120.0;
pub const STRIP_W: f64 = 160.0;
pub const STRIP_H: f64 = 6.0;

const HOVER_POLL: Duration = Duration::from_millis(33);
const MONITOR_POLL: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PillMode {
    Notch,
    Strip,
}

/// Where the overlay goes. `x`/`y` are logical and global (monitor origin / scale + offset);
/// `phys_x`/`phys_y` are the same point in physical global pixels.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OverlayLayout {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub phys_x: i32,
    pub phys_y: i32,
    pub scale: f64,
    pub mode: PillMode,
    pub pill_w: f64,
    pub pill_h: f64,
    pub notch: Option<NotchInfo>,
}

/// Payload of `overlay://config`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfig {
    pub mode: PillMode,
    pub notch_width: Option<f64>,
    pub notch_height: Option<f64>,
    pub pill_width: f64,
    pub pill_height: f64,
}

impl From<&OverlayLayout> for OverlayConfig {
    fn from(l: &OverlayLayout) -> Self {
        Self {
            mode: l.mode,
            notch_width: l.notch.map(|n| n.width),
            notch_height: l.notch.map(|n| n.height),
            pill_width: l.pill_w,
            pill_height: l.pill_h,
        }
    }
}

/// Interactive rect reported by the frontend, logical px relative to the window.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl HitRect {
    pub fn contains(&self, (px, py): (f64, f64)) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }
}

/// Overlay frame: 520×640 logical, centered horizontally at the top of the monitor.
/// `monitor_pos`/`monitor_size` are physical (as Tauri reports them).
pub fn overlay_frame(
    monitor_pos: (f64, f64),
    monitor_size: (f64, f64),
    scale: f64,
    notch: Option<NotchInfo>,
) -> OverlayLayout {
    let offset_x = (monitor_size.0 / scale - OVERLAY_W) / 2.0;
    let (mode, pill_w, pill_h) = match notch {
        Some(n) => (PillMode::Notch, n.width + 2.0 * PILL_EAR, n.height),
        None => (PillMode::Strip, STRIP_W, STRIP_H),
    };
    OverlayLayout {
        x: monitor_pos.0 / scale + offset_x,
        y: monitor_pos.1 / scale,
        w: OVERLAY_W,
        h: OVERLAY_H,
        phys_x: (monitor_pos.0 + offset_x * scale).round() as i32,
        phys_y: monitor_pos.1.round() as i32,
        scale,
        mode,
        pill_w,
        pill_h,
        notch,
    }
}

/// Cursor (physical global) → logical px relative to the overlay window.
/// `cursor_scale` is the factor the OS cursor position was scaled with (see `platform::cursor_scale`).
pub fn rel_cursor(cursor: (f64, f64), cursor_scale: f64, l: &OverlayLayout) -> (f64, f64) {
    (cursor.0 / cursor_scale - l.x, cursor.1 / cursor_scale - l.y)
}

/// Index of the monitor named `want`, else the primary, else the first.
pub fn pick_monitor(names: &[Option<String>], primary: Option<usize>, want: Option<&str>) -> Option<usize> {
    if names.is_empty() {
        return None;
    }
    want.and_then(|w| names.iter().position(|n| n.as_deref() == Some(w)))
        .or(primary.filter(|&i| i < names.len()))
        .or(Some(0))
}

/// Runtime overlay state shared by the commands and the polling threads.
#[derive(Default)]
pub struct OverlayState {
    hit_rect: Mutex<Option<HitRect>>,
    /// Layout plus the scale the OS cursor position uses.
    layout: Mutex<Option<(OverlayLayout, f64)>>,
    hovering: AtomicBool,
    expanded: AtomicBool,
}

impl OverlayState {
    pub fn set_hit_rect(&self, rect: Option<HitRect>) {
        *self.hit_rect.lock().unwrap_or_else(|p| p.into_inner()) = rect;
    }

    pub fn set_expanded(&self, expanded: bool) {
        self.expanded.store(expanded, Ordering::SeqCst);
    }

    pub fn is_expanded(&self) -> bool {
        self.expanded.load(Ordering::SeqCst)
    }

    pub fn config(&self) -> Option<OverlayConfig> {
        self.layout.lock().unwrap_or_else(|p| p.into_inner()).as_ref().map(|(l, _)| l.into())
    }
}

/// Creates the always-present overlay (label `notch`), places it and starts its polling threads.
pub fn create_overlay(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    app.manage(OverlayState::default());
    let win = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App(window_url(OVERLAY_LABEL, current_lang(app)).into()))
        .title("Timewatch")
        .inner_size(OVERLAY_W, OVERLAY_H)
        .transparent(true)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .shadow(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    platform::set_ignore_cursor_events(&win, true);
    platform::make_overlay(&win)?;
    reposition_overlay(app);
    platform::show_overlay(&win);
    start_hover_poll(app.clone());
    start_monitor_poll(app.clone());
    Ok(())
}

/// Places the overlay on `settings.overlay_monitor` (by name) or the primary monitor.
pub fn reposition_overlay(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else { return };
    let monitors = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();
    let want = app.try_state::<AppState>().and_then(|s| s.lock().settings().ok()).and_then(|s| s.overlay_monitor);
    let names: Vec<Option<String>> = monitors.iter().map(|m| m.name().cloned()).collect();
    let primary_idx = primary.as_ref().and_then(|p| monitors.iter().position(|m| m.position() == p.position()));
    let Some(m) = pick_monitor(&names, primary_idx, want.as_deref()).map(|i| &monitors[i]) else { return };

    let notch = platform::notch_info(app, m);
    let (pos, size) = (m.position(), m.size());
    let layout = overlay_frame(
        (f64::from(pos.x), f64::from(pos.y)),
        (f64::from(size.width), f64::from(size.height)),
        m.scale_factor(),
        notch,
    );
    let primary_scale = primary.as_ref().map_or(m.scale_factor(), |p| p.scale_factor());
    let cursor_scale = platform::cursor_scale(primary_scale, m.scale_factor());
    platform::position_overlay(&win, &layout);
    eprintln!(
        "[overlay] monitor {:?} {}x{}@{} notch {:?} -> frame ({}, {}) {}x{} mode {:?} pill {}x{}",
        m.name(),
        size.width,
        size.height,
        m.scale_factor(),
        notch,
        layout.x,
        layout.y,
        layout.w,
        layout.h,
        layout.mode,
        layout.pill_w,
        layout.pill_h
    );
    if let Some(state) = app.try_state::<OverlayState>() {
        *state.layout.lock().unwrap_or_else(|p| p.into_inner()) = Some((layout, cursor_scale));
    }
    let _ = app.emit("overlay://config", OverlayConfig::from(&layout));
}

/// Payload of `overlay://expanded`. `focus` is true only for user-initiated opens (tray, shortcut,
/// search click): the panel then pins and takes the keyboard. System-initiated opens (an absence
/// question appearing while the user types) must never steal focus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ExpandedEvent {
    pub expanded: bool,
    pub focus: bool,
}

/// Opens the panel. `focus` asks the frontend to pin it and take keyboard focus (user-initiated only).
pub fn expand_overlay(app: &AppHandle, focus: bool) {
    if let Some(state) = app.try_state::<OverlayState>() {
        state.set_expanded(true);
    }
    let _ = app.emit("overlay://expanded", ExpandedEvent { expanded: true, focus });
}

pub fn collapse_overlay(app: &AppHandle) {
    if let Some(state) = app.try_state::<OverlayState>() {
        state.set_expanded(false);
    }
    platform::unfocus_overlay(app);
    let _ = app.emit("overlay://expanded", ExpandedEvent { expanded: false, focus: false });
}

/// Expands the overlay and gives it keyboard focus (global shortcut, search field click).
pub fn focus_overlay(app: &AppHandle) {
    expand_overlay(app, true);
    platform::focus_overlay(app);
    let _ = app.emit("overlay://focus-search", ());
}

/// Click-through: the window ignores the cursor except over the frontend's hit rect.
fn start_hover_poll(app: AppHandle) {
    let t0 = Instant::now();
    let mut rest = intent::RestDetector::new();
    std::thread::spawn(move || loop {
        std::thread::sleep(HOVER_POLL);
        let (Some(state), Some(win)) = (app.try_state::<OverlayState>(), app.get_webview_window(OVERLAY_LABEL))
        else {
            continue;
        };
        let Some((layout, cursor_scale)) = *state.layout.lock().unwrap_or_else(|p| p.into_inner()) else {
            continue;
        };
        let Ok(c) = app.cursor_position() else { continue };
        let rect = *state.hit_rect.lock().unwrap_or_else(|p| p.into_inner());
        let inside = rect.is_some_and(|r| r.contains(rel_cursor((c.x, c.y), cursor_scale, &layout)));
        if state.hovering.swap(inside, Ordering::SeqCst) != inside {
            platform::set_ignore_cursor_events(&win, !inside);
            let _ = app.emit("overlay://hover", inside);
        }
        if inside {
            // Logical px, so the rest radius means the same on every display.
            let (x, y) = (c.x / cursor_scale, c.y / cursor_scale);
            if rest.sample(x, y, t0.elapsed().as_millis() as u64) {
                let _ = app.emit("overlay://rest", ());
            }
        } else {
            rest.reset();
        }
    });
}

/// Repositions the overlay when the monitor set or the chosen monitor changes.
fn start_monitor_poll(app: AppHandle) {
    std::thread::spawn(move || {
        let signature = |app: &AppHandle| {
            let monitors: Vec<_> = app
                .available_monitors()
                .unwrap_or_default()
                .iter()
                .map(|m| (m.name().cloned(), *m.position(), *m.size(), m.scale_factor().to_bits()))
                .collect();
            let want = app.try_state::<AppState>().and_then(|s| s.lock().settings().ok()).and_then(|s| s.overlay_monitor);
            format!("{monitors:?}{want:?}")
        };
        let mut last = signature(&app);
        loop {
            std::thread::sleep(MONITOR_POLL);
            let now = signature(&app);
            if now != last {
                last = now;
                reposition_overlay(&app);
            }
        }
    });
}

/// OS title of a normal window (`report`, `settings`, `onboarding`) in `lang`.
pub fn window_title(kind: &str, lang: Lang) -> Option<&'static str> {
    let t = lang.strings();
    match kind {
        "report" => Some(t.win_report),
        "settings" => Some(t.win_settings),
        "onboarding" => Some(t.win_onboarding),
        _ => None,
    }
}

/// The page a window loads; `lang` lets it render in the right language from the first frame.
pub fn window_url(kind: &str, lang: Lang) -> String {
    format!("index.html?view={kind}&lang={}", lang.code())
}

/// Renames the open normal windows after a language change.
pub fn retitle(app: &AppHandle, lang: Lang) {
    for kind in ["report", "settings", "onboarding"] {
        if let (Some(win), Some(title)) = (app.get_webview_window(kind), window_title(kind, lang)) {
            let _ = win.set_title(title);
        }
    }
}

/// Creates the window for `kind` (`report`, `settings`, `onboarding`) or focuses it if it exists.
/// Must not be called while holding the `AppState` lock (it reads the language).
pub fn create_or_focus(app: &AppHandle, kind: &str) -> Result<(), String> {
    let lang = current_lang(app);
    let (w, h, center, resizable) = match kind {
        "report" => (1020.0, 720.0, false, true),
        "settings" => (780.0, 600.0, false, true),
        "onboarding" => (640.0, 560.0, true, false),
        _ => return Err(fill(lang.strings().err_unknown_window, &[kind])),
    };
    let title = window_title(kind, lang).unwrap_or("Timewatch");
    if let Some(win) = app.get_webview_window(kind) {
        let _ = win.show();
        let _ = win.unminimize();
        sync_activation_policy(app, None);
        return win.set_focus().map_err(|e| e.to_string());
    }
    let mut b = WebviewWindowBuilder::new(app, kind, WebviewUrl::App(window_url(kind, lang).into()))
        .title(title)
        .inner_size(w, h)
        .resizable(resizable)
        .decorations(false)
        .transparent(true)
        .shadow(true);
    if center {
        b = b.center();
    }
    let win = b.build().map_err(|e| e.to_string())?;
    sync_activation_policy(app, None);
    let _ = win.set_focus();
    Ok(())
}

/// The overlay must never close (Alt+F4 on Windows once it has focus, ⌘W through the macOS
/// default Window menu): there would be no pill until restart. Normal windows close freely.
pub fn blocks_close(label: &str) -> bool {
    label == OVERLAY_LABEL
}

const NORMAL_WINDOWS: [&str; 3] = ["report", "settings", "onboarding"];

/// macOS: `Regular` (Dock icon, focusable, ⌘-tab) while a normal window is open, else `Accessory`.
/// `closing` is a window that is being destroyed and must not be counted.
pub fn sync_activation_policy(app: &AppHandle, closing: Option<&str>) {
    #[cfg(target_os = "macos")]
    {
        let any = NORMAL_WINDOWS.iter().any(|l| Some(*l) != closing && app.get_webview_window(l).is_some());
        let policy = if any { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, closing);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_centered_on_primary() {
        // 1512×982 logical points at scale 2 (14" MacBook Pro).
        let l = overlay_frame((0.0, 0.0), (3024.0, 1964.0), 2.0, None);
        assert_eq!(l.x, (1512.0 - 520.0) / 2.0);
        assert_eq!(l.y, 0.0);
        assert_eq!((l.w, l.h), (520.0, 640.0));
        assert_eq!((l.phys_x, l.phys_y), (992, 0));
        assert_eq!(l.scale, 2.0);
    }

    #[test]
    fn frame_on_secondary_monitor_offset() {
        let l = overlay_frame((3024.0, -200.0), (1920.0, 1080.0), 1.0, None);
        assert_eq!(l.x, 3024.0 + (1920.0 - 520.0) / 2.0);
        assert_eq!(l.y, -200.0);
        assert_eq!((l.phys_x, l.phys_y), (3724, -200));

        let l = overlay_frame((3024.0, 0.0), (5120.0, 2880.0), 2.0, None);
        assert_eq!(l.x, 1512.0 + (2560.0 - 520.0) / 2.0);
        assert_eq!(l.phys_x, 3024 + 1020 * 2);
    }

    #[test]
    fn pill_mode_notch_when_notch_present() {
        // Pill is as tall as the notch and has a 120 px "ear" on each side.
        let notch = NotchInfo { width: 220.0, height: 38.0 };
        let l = overlay_frame((0.0, 0.0), (3600.0, 2338.0), 2.0, Some(notch));
        assert_eq!(l.mode, PillMode::Notch);
        assert_eq!(l.notch, Some(notch));
        assert_eq!((l.pill_w, l.pill_h), (220.0 + 2.0 * 120.0, 38.0));
        assert_eq!(l.x, (1800.0 - 520.0) / 2.0);
    }

    #[test]
    fn pill_mode_strip_without_notch() {
        let l = overlay_frame((0.0, 0.0), (1920.0, 1080.0), 1.0, None);
        assert_eq!(l.mode, PillMode::Strip);
        assert_eq!(l.notch, None);
        assert_eq!((l.pill_w, l.pill_h), (160.0, 6.0));
    }

    #[test]
    fn window_titles_per_language() {
        use crate::i18n::Lang;
        assert_eq!(window_title("report", Lang::PtBr), Some("Horas"));
        assert_eq!(window_title("settings", Lang::PtBr), Some("Configurações"));
        assert_eq!(window_title("onboarding", Lang::PtBr), Some("Bem-vindo"));
        assert_eq!(window_title("report", Lang::En), Some("Hours"));
        assert_eq!(window_title("settings", Lang::Es), Some("Configuración"));
        assert_eq!(window_title("onboarding", Lang::En), Some("Welcome"));
        assert_eq!(window_title("notch", Lang::En), None);
    }

    #[test]
    fn window_url_carries_view_and_lang() {
        use crate::i18n::Lang;
        assert_eq!(window_url("report", Lang::En), "index.html?view=report&lang=en");
        assert_eq!(window_url("notch", Lang::PtBr), "index.html?view=notch&lang=pt-BR");
    }

    #[test]
    fn pill_mode_serializes_lowercase() {
        assert_eq!(serde_json::to_value(PillMode::Notch).unwrap(), "notch");
        assert_eq!(serde_json::to_value(PillMode::Strip).unwrap(), "strip");
        let l = overlay_frame((0.0, 0.0), (1920.0, 1080.0), 1.0, None);
        let v = serde_json::to_value(OverlayConfig::from(&l)).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "mode": "strip", "notchWidth": null, "notchHeight": null, "pillWidth": 160.0, "pillHeight": 6.0
            })
        );
        let notch = NotchInfo { width: 185.0, height: 32.0 };
        let l = overlay_frame((0.0, 0.0), (3024.0, 1964.0), 2.0, Some(notch));
        let v = serde_json::to_value(OverlayConfig::from(&l)).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "mode": "notch", "notchWidth": 185.0, "notchHeight": 32.0, "pillWidth": 425.0, "pillHeight": 32.0
            })
        );
    }

    #[test]
    fn only_the_overlay_refuses_to_close() {
        assert!(blocks_close("notch"));
        for l in ["report", "settings", "onboarding"] {
            assert!(!blocks_close(l), "{l}");
        }
    }

    #[test]
    fn expanded_event_carries_focus_flag() {
        let v = serde_json::to_value(ExpandedEvent { expanded: true, focus: false }).unwrap();
        assert_eq!(v, serde_json::json!({ "expanded": true, "focus": false }));
    }

    #[test]
    fn cursor_relative_to_window() {
        let l = overlay_frame((0.0, 0.0), (3024.0, 1964.0), 2.0, None);
        // Physical cursor (1000, 20) at scale 2 → logical (500, 10) → window-relative (4, 10).
        assert_eq!(rel_cursor((1000.0, 20.0), 2.0, &l), (4.0, 10.0));
        let l = overlay_frame((3024.0, 0.0), (1920.0, 1080.0), 1.0, None);
        assert_eq!(rel_cursor((3724.0 + 30.0, 5.0), 1.0, &l), (30.0, 5.0));
    }

    #[test]
    fn hit_rect_contains() {
        let r = HitRect { x: 140.0, y: 0.0, w: 240.0, h: 32.0 };
        assert!(r.contains((140.0, 0.0)));
        assert!(r.contains((379.9, 31.9)));
        assert!(!r.contains((380.0, 10.0)));
        assert!(!r.contains((200.0, 32.0)));
        assert!(!r.contains((139.0, 10.0)));
    }

    #[test]
    fn picks_named_monitor_else_primary() {
        let names = [Some("Built-in".to_string()), Some("LG".to_string()), None];
        assert_eq!(pick_monitor(&names, Some(0), Some("LG")), Some(1));
        assert_eq!(pick_monitor(&names, Some(0), Some("Gone")), Some(0));
        assert_eq!(pick_monitor(&names, Some(2), None), Some(2));
        assert_eq!(pick_monitor(&names, None, None), Some(0));
        assert_eq!(pick_monitor(&[], None, None), None);
    }
}
