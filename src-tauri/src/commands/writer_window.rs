use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Open (or focus) the standalone breakout writer window.
///
/// The writer window loads the same `index.html` with `?mode=writer` so the
/// React app can detect it and render `BreakoutWriterApp` instead of the full
/// main app.  If a writer window is already open it is simply focused.
#[tauri::command]
pub fn open_writer_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("writer") {
        win.set_focus().map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "writer",
        WebviewUrl::App("index.html?mode=writer".into()),
    )
    .title("Write — MoodBloom")
    .inner_size(680.0, 900.0)
    .min_inner_size(480.0, 600.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
