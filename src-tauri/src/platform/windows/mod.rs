use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST,
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

/// Adds (`on`) or removes extended style bits.
fn set_ex_style(hwnd: HWND, bits: u32, on: bool) {
    // SAFETY: `hwnd` is a live window handle owned by this process.
    unsafe {
        let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next = if on { cur | bits as isize } else { cur & !(bits as isize) };
        if next != cur {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        }
    }
}

pub fn make_overlay(window: &WebviewWindow) -> Result<(), String> {
    let h = hwnd(window).ok_or("overlay sem HWND")?;
    set_ex_style(h, (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST).0, true);
    Ok(())
}

/// A `WS_EX_NOACTIVATE` window cannot take keyboard focus: drop the bit, then activate.
pub fn focus_overlay(app: &AppHandle) {
    let Some(h) = app.get_webview_window(OVERLAY_LABEL).as_ref().and_then(hwnd) else { return };
    set_ex_style(h, WS_EX_NOACTIVATE.0, false);
    // SAFETY: valid HWND of our own window.
    let _ = unsafe { SetForegroundWindow(h) };
}

pub fn unfocus_overlay(app: &AppHandle) {
    let Some(h) = app.get_webview_window(OVERLAY_LABEL).as_ref().and_then(hwnd) else { return };
    set_ex_style(h, WS_EX_NOACTIVATE.0, true);
}
