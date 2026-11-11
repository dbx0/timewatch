//! Window creation helpers.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Creates the window for `kind` (`report`, `settings`, `onboarding`) or focuses it if it exists.
pub fn create_or_focus(app: &AppHandle, kind: &str) -> Result<(), String> {
    let (w, h, center, resizable, title) = match kind {
        "report" => (1020.0, 720.0, false, true, "Timewatch"),
        "settings" => (780.0, 600.0, false, true, "Ajustes"),
        "onboarding" => (640.0, 560.0, true, false, "Bem-vindo"),
        _ => return Err(format!("Janela desconhecida: {kind}")),
    };
    if let Some(win) = app.get_webview_window(kind) {
        let _ = win.show();
        let _ = win.unminimize();
        return win.set_focus().map_err(|e| e.to_string());
    }
    let mut b = WebviewWindowBuilder::new(app, kind, WebviewUrl::App(format!("index.html?view={kind}").into()))
        .title(title)
        .inner_size(w, h)
        .resizable(resizable);
    if center {
        b = b.center();
    }
    b.build().map(|_| ()).map_err(|e| e.to_string())
}
