//! `gitbell notify "title" [--body text] [--url https://...]`
//!
//! There is no separate CLI binary. A second launch of the app hands its
//! argv to the running instance through tauri-plugin-single-instance and
//! exits; the running instance parses the args here and shows the toast.
//! If no instance is running, the launch becomes the instance and runs the
//! command once the app is up (see lib.rs setup).

use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct NotifyArgs {
    pub title: String,
    pub body: String,
    pub url: Option<String>,
}

/// Parse `argv` (including argv[0]). Returns None when this isn't a
/// `notify` invocation. Keeps parsing dependency-free: no clap for three flags.
pub fn parse_notify(argv: &[String]) -> Option<NotifyArgs> {
    let mut it = argv.iter().skip(1).peekable();
    if it.next().map(String::as_str) != Some("notify") {
        return None;
    }
    let mut title: Option<String> = None;
    let mut body = String::new();
    let mut url: Option<String> = None;
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--body" | "-b" => body = it.next().cloned().unwrap_or_default(),
            "--url" | "-u" => url = it.next().cloned(),
            "--title" | "-t" => title = it.next().cloned(),
            s if s.starts_with("--") => {} // unknown flag, ignore
            s => {
                if title.is_none() {
                    title = Some(s.to_string());
                }
            }
        }
    }
    let title = title.filter(|t| !t.trim().is_empty())?;
    // the caller is a local process the user runs, so any https link is fine
    let url = url.filter(|u| u.starts_with("https://"));
    Some(NotifyArgs {
        title: title.chars().take(120).collect(),
        body: body.chars().take(300).collect(),
        url,
    })
}

/// Toast + tray animation + tell the webview so it plays the category
/// sound and adds the notice to "recent activity".
pub fn run_notify(app: &AppHandle, args: NotifyArgs) {
    crate::tray::ring_tray(app.clone());
    let _ = crate::notify::show_trusted(app.clone(), &args.title, &args.body, args.url.clone());
    let _ = app.emit("external-notice", &args);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(s: &[&str]) -> Vec<String> {
        std::iter::once("gitbell").chain(s.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn parses_title_body_url() {
        let a = parse_notify(&argv(&["notify", "Build done", "--body", "all green", "--url", "https://x.dev/1"])).unwrap();
        assert_eq!(a.title, "Build done");
        assert_eq!(a.body, "all green");
        assert_eq!(a.url.as_deref(), Some("https://x.dev/1"));
    }

    #[test]
    fn rejects_non_https_and_empty_title() {
        let a = parse_notify(&argv(&["notify", "x", "--url", "http://x"])).unwrap();
        assert_eq!(a.url, None);
        assert!(parse_notify(&argv(&["notify"])).is_none());
        assert!(parse_notify(&argv(&["notify", "   "])).is_none());
    }

    #[test]
    fn ignores_other_launches() {
        assert!(parse_notify(&argv(&[])).is_none());
        assert!(parse_notify(&argv(&["--minimized"])).is_none());
    }
}
