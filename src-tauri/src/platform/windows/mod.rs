use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
};

use crate::window::OVERLAY_LABEL;

pub fn idle_seconds() -> f64 {
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: `info` is a valid LASTINPUTINFO with cbSize set.
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0.0;
    }
    let now = unsafe { GetTickCount() };
    f64::from(now.wrapping_sub(info.dwTime)) / 1000.0
}

fn hwnd(window: &WebviewWindow) -> Option<HWND> {
    // Tauri may link a different `windows` version; go through the raw pointer.
    window.hwnd().ok().map(|h| HWND(h.0 as _))
}

/// tao rebuilds GWL_EXSTYLE from its own flags on every flag change (ignore-cursor, focusable)
/// and has no flag for WS_EX_TOOLWINDOW, so it is re-added after each such change. The task is
/// queued on the event loop behind the Tauri setter that triggered the rebuild (FIFO), or runs
/// inline right after it when already on the main thread.
fn reapply_toolwindow(window: &WebviewWindow, then: impl FnOnce(HWND) + Send + 'static) {
    let Some(h) = hwnd(window) else { return };
    let raw = h.0 as usize;
    let _ = window.run_on_main_thread(move || {
        let h = HWND(raw as _);
        // SAFETY: `h` is a live window handle owned by this process, used on its thread.
        unsafe {
            let cur = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let next = cur | WS_EX_TOOLWINDOW.0 as isize;
            if next != cur {
                SetWindowLongPtrW(h, GWL_EXSTYLE, next);
            }
        }
        then(h);
    });
}

/// Non-activation comes from `focusable(false)` (tao's WS_EX_NOACTIVATE) and topmost from
/// `always_on_top(true)`; only WS_EX_TOOLWINDOW (hidden from Alt+Tab) is ours.
pub fn make_overlay(window: &WebviewWindow) -> Result<(), String> {
    hwnd(window).ok_or("overlay sem HWND")?;
    reapply_toolwindow(window, |_| {});
    Ok(())
}

pub fn set_ignore_cursor_events(window: &WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
    reapply_toolwindow(window, |_| {});
}

/// Focusability goes through Tauri so tao's own flags (and later rebuilds) agree.
pub fn focus_overlay(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else { return };
    let _ = win.set_focusable(true);
    reapply_toolwindow(&win, |h| {
        // SAFETY: valid HWND of our own window.
        let _ = unsafe { SetForegroundWindow(h) };
    });
}

pub fn unfocus_overlay(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else { return };
    let _ = win.set_focusable(false);
    reapply_toolwindow(&win, |_| {});
}
