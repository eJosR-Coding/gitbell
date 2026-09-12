//! The handful of strings Rust shows on its own: tray menu and the toast
//! action button. Everything else is translated in the webview.

use std::sync::atomic::{AtomicU8, Ordering};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    Es = 0,
    En = 1,
}

static CURRENT: AtomicU8 = AtomicU8::new(Lang::Es as u8);

impl Lang {
    /// "es-PE", "en_US.UTF-8", "es" ... anything else falls back to English.
    pub fn from_tag(tag: &str) -> Lang {
        if tag.to_ascii_lowercase().starts_with("es") {
            Lang::Es
        } else {
            Lang::En
        }
    }

    /// Best guess before the webview tells us the user's preference.
    pub fn system() -> Lang {
        sys_locale::get_locale()
            .map(|l| Lang::from_tag(&l))
            .unwrap_or(Lang::En)
    }
}

pub fn set(lang: Lang) {
    CURRENT.store(lang as u8, Ordering::Relaxed);
}

pub fn get() -> Lang {
    if CURRENT.load(Ordering::Relaxed) == Lang::Es as u8 {
        Lang::Es
    } else {
        Lang::En
    }
}

pub fn tr(key: &str) -> &'static str {
    match (get(), key) {
        (Lang::Es, "tray.open") => "Abrir GitBell",
        (Lang::Es, "tray.poll") => "Revisar ahora",
        (Lang::Es, "tray.quit") => "Salir",
        (Lang::Es, "toast.open") => "Abrir",
        (Lang::En, "tray.open") => "Open GitBell",
        (Lang::En, "tray.poll") => "Check now",
        (Lang::En, "tray.quit") => "Quit",
        (Lang::En, "toast.open") => "Open",
        _ => key_fallback(key),
    }
}

fn key_fallback(key: &str) -> &'static str {
    // a missing key is a programming error; make it visible, don't panic
    eprintln!("i18n: missing key {key}");
    "?"
}

/// Webview resolved the user's language setting; keep Rust in sync and
/// rebuild the tray menu so its labels switch too.
#[tauri::command]
pub fn set_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    set(Lang::from_tag(&lang));
    crate::tray::refresh_menu(&app).map_err(crate::err_str)
}

#[cfg(test)]
mod tests {
    use super::Lang;

    #[test]
    fn tag_mapping() {
        assert_eq!(Lang::from_tag("es-PE"), Lang::Es);
        assert_eq!(Lang::from_tag("ES_ES.UTF-8"), Lang::Es);
        assert_eq!(Lang::from_tag("en-US"), Lang::En);
        assert_eq!(Lang::from_tag("pt-BR"), Lang::En);
        assert_eq!(Lang::from_tag(""), Lang::En);
    }
}
