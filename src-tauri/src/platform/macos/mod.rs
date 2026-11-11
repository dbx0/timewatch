use std::sync::mpsc;

use objc2::MainThreadMarker;
use objc2_app_kit::NSScreen;
use tauri::{AppHandle, Manager, Monitor, WebviewWindow};
use tauri_nspanel::{CollectionBehavior, ManagerExt, StyleMask, WebviewWindowExt};

use super::NotchInfo;
use crate::window::OVERLAY_LABEL;

/// `NSMainMenuWindowLevel` (24) + 1: above the menu bar, over fullscreen apps.
const OVERLAY_LEVEL: i64 = 25;

mod panel {
    use tauri_nspanel::tauri_panel;

    tauri_panel! {
        panel!(OverlayPanel {
            config: {
                can_become_key_window: true,
                can_become_main_window: false,
                becomes_key_only_if_needed: true,
                is_floating_panel: true
            }
        })
    }
}
use panel::OverlayPanel;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
}

/// `kCGEventSourceStateCombinedSessionState` (0) and `kCGAnyInputEventType` (!0).
pub fn idle_seconds() -> f64 {
    let s = unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) };
    if s.is_finite() && s > 0.0 {
        s
    } else {
        0.0
    }
}

/// Runs `f` on the main thread and waits for its result (inline when already there).
fn on_main<T: Send + 'static>(app: &AppHandle, f: impl FnOnce(MainThreadMarker) -> T + Send + 'static) -> Option<T> {
    if let Some(mtm) = MainThreadMarker::new() {
        return Some(f(mtm));
    }
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        if let Some(mtm) = MainThreadMarker::new() {
            let _ = tx.send(f(mtm));
        }
    })
    .ok()?;
    rx.recv().ok()
}

/// Matches the NSScreen whose frame equals the monitor's (global points), then reads the notch.
pub fn notch_info(app: &AppHandle, monitor: &Monitor) -> Option<NotchInfo> {
    let scale = monitor.scale_factor();
    let (x, w, h) = (
        f64::from(monitor.position().x) / scale,
        f64::from(monitor.size().width) / scale,
        f64::from(monitor.size().height) / scale,
    );
    on_main(app, move |mtm| {
        let screens = NSScreen::screens(mtm);
        let screen = screens.iter().find(|s| {
            let f = s.frame();
            (f.origin.x - x).abs() < 1.0 && (f.size.width - w).abs() < 1.0 && (f.size.height - h).abs() < 1.0
        })?;
        let top = screen.safeAreaInsets().top;
        if top <= 0.0 {
            return None;
        }
        let width = screen.frame().size.width
            - screen.auxiliaryTopLeftArea().size.width
            - screen.auxiliaryTopRightArea().size.width;
        (width > 0.0).then_some(NotchInfo { width, height: top })
    })
    .flatten()
}

pub fn make_overlay(window: &WebviewWindow) -> Result<(), String> {
    let window = window.clone();
    on_main(&window.app_handle().clone(), move |_| -> Result<(), String> {
        let panel = window.to_panel::<OverlayPanel>().map_err(|e| e.to_string())?;
        panel.set_level(OVERLAY_LEVEL);
        panel
            .add_style_mask(StyleMask::empty().nonactivating_panel().into())
            .map_err(|e| format!("{e:?}"))?;
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .stationary()
                .full_screen_auxiliary()
                .ignores_cycle()
                .into(),
        );
        panel.set_has_shadow(false);
        panel.set_hides_on_deactivate(false);
        panel.set_works_when_modal(true);
        Ok(())
    })
    .unwrap_or_else(|| Err("main thread unavailable".into()))
}

fn with_panel(app: &AppHandle, f: impl FnOnce(&dyn tauri_nspanel::Panel) + Send + 'static) {
    let handle = app.clone();
    let _ = on_main(app, move |_| {
        if let Ok(panel) = handle.get_webview_panel(OVERLAY_LABEL) {
            f(panel.as_ref());
        }
    });
}

pub fn show_overlay(window: &WebviewWindow) {
    with_panel(window.app_handle(), |p| p.order_front_regardless());
}

pub fn focus_overlay(app: &AppHandle) {
    with_panel(app, |p| p.make_key_window());
}

pub fn unfocus_overlay(app: &AppHandle) {
    with_panel(app, |p| p.resign_key_window());
}
