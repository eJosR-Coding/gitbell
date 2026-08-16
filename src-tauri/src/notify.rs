//! OS toasts. On Linux we talk to the freedesktop daemon directly so we can
//! set the visible app name, the `desktop-entry` hint (Plasma then shows our
//! icon and lets the user configure GitBell in its notification settings)
//! and a click action that opens the event on GitHub. Elsewhere we defer to
//! the notification plugin, which knows how to register on Windows.

use tauri::AppHandle;

/// Only ever open links that point at GitHub. The URL comes from the
/// webview, and the webview renders content written by strangers on the
/// internet, so we don't trust it blindly (trust boundary, see SECURITY.md).
fn is_allowed_url(url: &str) -> bool {
    url.starts_with("https://github.com/")
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String, url: Option<String>) -> Result<(), String> {
    let url = url.filter(|u| is_allowed_url(u));
    show(app, &title, &body, url)
}

#[cfg(target_os = "linux")]
fn show(app: AppHandle, title: &str, body: &str, url: Option<String>) -> Result<(), String> {
    use notify_rust::{Hint, Notification};
    use tauri_plugin_opener::OpenerExt;

    let mut n = Notification::new();
    n.appname("GitBell")
        .summary(title)
        .body(body)
        .icon("gitbell")
        .hint(Hint::DesktopEntry("gitbell".into()))
        .hint(Hint::Category("im.received".into()));
    if url.is_some() {
        n.action("default", "Abrir");
    }
    let handle = n.show().map_err(crate::err_str)?;
    if let Some(url) = url {
        // wait_for_action blocks until the toast is clicked or closed,
        // so it gets its own thread
        std::thread::spawn(move || {
            handle.wait_for_action(|action| {
                if action == "default" {
                    let _ = app.opener().open_url(&url, None::<&str>);
                }
            });
        });
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn show(app: AppHandle, title: &str, body: &str, _url: Option<String>) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(crate::err_str)
}

#[cfg(test)]
mod tests {
    use super::is_allowed_url;

    #[test]
    fn only_github_https() {
        assert!(is_allowed_url("https://github.com/tauri-apps/tauri/pull/1"));
        assert!(!is_allowed_url("http://github.com/x"));
        assert!(!is_allowed_url("https://github.com.evil.io/x"));
        assert!(!is_allowed_url("file:///etc/passwd"));
        assert!(!is_allowed_url("javascript:alert(1)"));
    }
}
