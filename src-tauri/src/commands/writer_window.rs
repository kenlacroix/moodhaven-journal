/// Open (or focus) the standalone breakout writer window.
/// Desktop only — no-op on Android.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn open_writer_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
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
    .map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

/// No-op stub for Android — multi-window not supported on mobile.
#[cfg(target_os = "android")]
#[tauri::command]
pub fn open_writer_window() -> Result<(), String> {
    Ok(())
}
