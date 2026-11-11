//! OS-specific facade. Platform code lives only in `macos` and `windows`.

use tauri::{AppHandle, Monitor, Runtime, WebviewWindow};

use crate::window::OverlayLayout;

#[cfg(target_os = "macos")]
mod macos;
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
    #[cfg(not(target_os = "macos"))]
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

/// Moves and sizes the overlay. macOS uses global points; elsewhere physical pixels.
pub fn position_overlay(window: &WebviewWindow, l: &OverlayLayout) {
    let _ = window.set_size(tauri::LogicalSize::new(l.w, l.h));
    if cfg!(target_os = "macos") {
        let _ = window.set_position(tauri::LogicalPosition::new(l.x, l.y));
    } else {
        let _ = window.set_position(tauri::PhysicalPosition::new(l.phys_x, l.phys_y));
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
