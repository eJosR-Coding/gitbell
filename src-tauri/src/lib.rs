//! GitBell backend. Rust is kept thin on purpose: it owns what the webview
//! can't or shouldn't do (tray, window lifecycle, OS keyring, toasts, file
//! copies) and leaves the GitHub polling logic to TypeScript.
//!
//! Module map:
//!   tray    - tray icon, menu, bell animation
//!   notify  - OS toasts (freedesktop hints + click action on Linux)
//!   secrets - GitHub token in the OS keyring, never on disk in plaintext
//!   sounds  - import user audio files into the app data dir

mod i18n;
mod notify;
mod secrets;
mod sounds;
mod tray;

use tauri::{Manager, WindowEvent};

/// CLI flag the autostart entry passes so we boot straight to the tray
/// instead of popping the settings window in the user's face on login.
const MINIMIZED_FLAG: &str = "--minimized";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // second launch? don't spawn a twin, just surface the existing window
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args([MINIMIZED_FLAG])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            tray::ring_tray,
            notify::notify,
            secrets::get_token,
            secrets::set_token,
            secrets::delete_token,
            sounds::import_sound,
            i18n::set_language,
        ])
        .setup(|app| {
            // system locale until the webview reports the user's setting
            i18n::set(i18n::Lang::system());
            tray::build_tray(app.handle())?;

            // window starts hidden (see tauri.conf.json). Only show it when
            // the user launched us by hand, not from the autostart entry.
            let launched_minimized = std::env::args().any(|a| a == MINIMIZED_FLAG);
            if !launched_minimized {
                tray::show_main_window(app.handle());
            }
            Ok(())
        })
        // "X" on the window means "go to tray", not "kill the app".
        // Quitting for real only happens from the tray menu.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Small helper so every command can return `Result<T, String>` without
/// each module re-implementing the error mapping.
pub(crate) fn err_str<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Sanity check used by tests and by main window lookups.
pub(crate) fn main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}
