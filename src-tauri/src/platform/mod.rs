//! OS-specific facade. Platform code lives only in `macos` and `windows`.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

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
