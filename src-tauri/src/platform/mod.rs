//! OS-specific facade. Platform code lives only in `macos` and `windows`.

use tauri::{AppHandle, Monitor, Runtime, WebviewWindow};

use crate::window::OverlayLayout;

#[cfg(target_os = "macos")]
mod macos;
pub mod power;
#[cfg(target_os = "windows")]
mod windows;

/// Notch geometry in logical points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NotchInfo {
    pub width: f64,
    pub height: f64,
}

/// Registers platform plugins (macOS: tauri-nspanel).
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    #[cfg(target_os = "macos")]
    {
        builder.plugin(tauri_nspanel::init())
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder
    }
}

/// Seconds since the last keyboard or mouse input (0.0 where unsupported).
pub fn idle_seconds() -> f64 {
    #[cfg(target_os = "macos")]
    {
        macos::idle_seconds()
    }
    #[cfg(target_os = "windows")]
    {
        windows::idle_seconds()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        0.0
    }
}

/// Milliseconds on a monotonic clock that does NOT advance while the system sleeps, so a wall-clock
/// jump beyond it reveals a sleep. macOS: `Instant` is `CLOCK_UPTIME_RAW` (excludes sleep).
/// Windows: `Instant` (QPC) keeps counting during sleep, so use `QueryUnbiasedInterruptTime`.
pub fn monotonic_ms() -> u64 {
    #[cfg(target_os = "windows")]
    {
        windows::monotonic_ms()
    }
    #[cfg(not(target_os = "windows"))]
    {
        use std::sync::OnceLock;
        use std::time::Instant;
        static ORIGIN: OnceLock<Instant> = OnceLock::new();
        ORIGIN.get_or_init(Instant::now).elapsed().as_millis() as u64
    }
}

/// Notch size of `monitor`, if it has one (macOS only).
pub fn notch_info(app: &AppHandle, monitor: &Monitor) -> Option<NotchInfo> {
    #[cfg(target_os = "macos")]
    {
        macos::notch_info(app, monitor)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, monitor);
        None
    }
}

/// Makes the overlay a non-activating, always-on-top, all-Spaces window.
pub fn make_overlay(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::make_overlay(window)
    }
    #[cfg(target_os = "windows")]
    {
        windows::make_overlay(window)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window;
        Ok(())
    }
}

/// Toggles click-through. Windows re-adds styles tao drops when it rebuilds them.
pub fn set_ignore_cursor_events(window: &WebviewWindow, ignore: bool) {
    #[cfg(target_os = "windows")]
    {
        windows::set_ignore_cursor_events(window, ignore)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.set_ignore_cursor_events(ignore);
    }
}

/// Shows the overlay without activating the app or taking focus.
pub fn show_overlay(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        macos::show_overlay(window)
    }
    #[cfg(target_os = "windows")]
    {
        windows::show_overlay(window)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window.show();
    }
}

/// Scale that `AppHandle::cursor_position` used: macOS converts points with the primary
/// screen's scale; elsewhere the cursor is in physical pixels of the overlay's monitor.
pub fn cursor_scale(primary_scale: f64, monitor_scale: f64) -> f64 {
    if cfg!(target_os = "macos") {
        primary_scale
    } else {
        monitor_scale
    }
}

/// Moves and sizes the overlay. macOS uses global points; elsewhere physical pixels, with the
/// size computed from the target monitor's scale. Setting a logical size first would resolve it
/// against the monitor the window is leaving (mixed-DPI drift), so the position goes first.
pub fn position_overlay(window: &WebviewWindow, l: &OverlayLayout) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_size(tauri::LogicalSize::new(l.w, l.h));
        let _ = window.set_position(tauri::LogicalPosition::new(l.x, l.y));
    }
    #[cfg(not(target_os = "macos"))]
    let (pos, size) = {
        let (w, h) = l.phys_size();
        (
            tauri::PhysicalPosition::new(l.phys_x, l.phys_y),
            tauri::PhysicalSize::new(w, h),
        )
    };
    #[cfg(target_os = "windows")]
    {
        windows::set_frame(window, pos, size);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window.set_position(pos);
        let _ = window.set_size(size);
    }
}

/// Gives the overlay keyboard focus.
pub fn focus_overlay(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        macos::focus_overlay(app)
    }
    #[cfg(target_os = "windows")]
    {
        windows::focus_overlay(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
    }
}

/// Gives keyboard focus back (the overlay stops being key / activatable).
pub fn unfocus_overlay(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        macos::unfocus_overlay(app)
    }
    #[cfg(target_os = "windows")]
    {
        windows::unfocus_overlay(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monotonic_ms_never_goes_backwards_and_advances() {
        let a = monotonic_ms();
        std::thread::sleep(std::time::Duration::from_millis(20));
        let b = monotonic_ms();
        assert!(b >= a + 15, "{a} -> {b}");
    }
}
