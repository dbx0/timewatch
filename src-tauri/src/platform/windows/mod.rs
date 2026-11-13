use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::System::WindowsProgramming::QueryUnbiasedInterruptTime;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, IsWindow, SetForegroundWindow, SetWindowLongPtrW,
    SetWindowPos, GWL_EXSTYLE, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER, WS_EX_TOOLWINDOW,
};

use crate::window::OVERLAY_LABEL;

pub fn idle_seconds() -> f64 {
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` is a valid LASTINPUTINFO with cbSize set.
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0.0;
    }
    let now = unsafe { GetTickCount() };
    f64::from(now.wrapping_sub(info.dwTime)) / 1000.0
}

/// Interrupt time excluding sleep/hibernate, in ms (the API counts 100 ns units).
pub fn monotonic_ms() -> u64 {
    let mut t: u64 = 0;
    // SAFETY: `t` is a valid out pointer for the duration of the call.
    if !unsafe { QueryUnbiasedInterruptTime(&mut t) }.as_bool() {
        return 0;
    }
    t / 10_000
}

fn hwnd(window: &WebviewWindow) -> Option<HWND> {
    // Tauri may link a different `windows` version; go through the raw pointer.
    window.hwnd().ok().map(|h| HWND(h.0 as _))
}

/// tao rebuilds GWL_EXSTYLE from its own flags on every flag change (visibility, ignore-cursor,
/// focusable, position/size via MAXIMIZED, always-on-top) and has no flag for WS_EX_TOOLWINDOW.
/// Every tao-backed setter used on the overlay therefore goes through this helper: it runs `f`,
/// then queues a main-thread task that re-adds WS_EX_TOOLWINDOW and runs `then`. Event-loop
/// messages are FIFO (and both run inline when already on the main thread), so the task runs
/// after tao's `SetWindowLongW`.
fn with_toolwindow(
    window: &WebviewWindow,
    f: impl FnOnce(&WebviewWindow),
    then: impl FnOnce(HWND) + Send + 'static,
) {
    f(window);
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
    if hwnd(window).is_none() {
        return Err("overlay window has no HWND".into());
    }
    with_toolwindow(window, |_| {}, |_| {});
    Ok(())
}

pub fn show_overlay(window: &WebviewWindow) {
    with_toolwindow(window, |w| drop(w.show()), |_| {});
}

/// Mixed DPI: moving the window onto a monitor with another scale makes Windows send
/// WM_DPICHANGED, and tao rescales the window from the old scale. So move first (through tao, so
/// the DPI change is handled while the move runs), then, on the main thread after it, apply the
/// final position and the physical size computed for the target monitor in one `SetWindowPos`.
/// The window then already has the target DPI, so that call triggers no further rescale.
pub fn set_frame(
    window: &WebviewWindow,
    pos: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
) {
    with_toolwindow(
        window,
        |w| drop(w.set_position(pos)),
        move |h| {
            // SAFETY: valid HWND of our own window, on its thread.
            let _ = unsafe {
                SetWindowPos(
                    h,
                    None,
                    pos.x,
                    pos.y,
                    size.width as i32,
                    size.height as i32,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                )
            };
        },
    );
}

pub fn set_ignore_cursor_events(window: &WebviewWindow, ignore: bool) {
    with_toolwindow(window, |w| drop(w.set_ignore_cursor_events(ignore)), |_| {});
}

/// Window that had the keyboard before the overlay took it (raw HWND, 0 = none).
static PREV_FOREGROUND: AtomicUsize = AtomicUsize::new(0);

/// Focusability goes through Tauri so tao's own flags (and later rebuilds) agree.
pub fn focus_overlay(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };
    with_toolwindow(
        &win,
        |w| drop(w.set_focusable(true)),
        |h| {
            // SAFETY: plain Win32 calls with our own valid HWND.
            unsafe {
                let prev = GetForegroundWindow();
                if !prev.is_invalid() && prev != h {
                    PREV_FOREGROUND.store(prev.0 as usize, Ordering::SeqCst);
                }
                let _ = SetForegroundWindow(h);
            }
        },
    );
}

/// Gives the keyboard back to the window that had it before `focus_overlay`, but only when the
/// overlay still holds it (the user may have clicked elsewhere meanwhile).
pub fn unfocus_overlay(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };
    with_toolwindow(
        &win,
        |w| drop(w.set_focusable(false)),
        |h| {
            let prev = PREV_FOREGROUND.swap(0, Ordering::SeqCst);
            if prev == 0 {
                return;
            }
            let prev = HWND(prev as _);
            // SAFETY: plain Win32 calls; `IsWindow` guards against a since-destroyed window.
            unsafe {
                if GetForegroundWindow() == h && IsWindow(Some(prev)).as_bool() {
                    let _ = SetForegroundWindow(prev);
                }
            }
        },
    );
}
