//! Tray icon: the "real" UI of the app. The window is just settings, the
//! tray is what lives all day.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::i18n::tr;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter,
};

const TRAY_ID: &str = "main-tray";

/// Bell-ringing animation frames, baked into the binary at compile time.
/// Generated from assets/sprite.png, see APUNTES.md for the ImageMagick recipe.
const FRAMES: [&[u8]; 8] = [
    include_bytes!("../icons/tray/frame-0.png"),
    include_bytes!("../icons/tray/frame-1.png"),
    include_bytes!("../icons/tray/frame-2.png"),
    include_bytes!("../icons/tray/frame-3.png"),
    include_bytes!("../icons/tray/frame-4.png"),
    include_bytes!("../icons/tray/frame-5.png"),
    include_bytes!("../icons/tray/frame-6.png"),
    include_bytes!("../icons/tray/frame-7.png"),
];
const FRAME_MS: u64 = 90;
const RING_LOOPS: usize = 2;

/// True while an animation is playing, so a burst of notices doesn't
/// spawn five overlapping threads fighting over the icon.
static RINGING: AtomicBool = AtomicBool::new(false);

/// Bring the main window back. Used by the tray, by single-instance and
/// by the "open" menu item. No-op if the window somehow doesn't exist.
pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = crate::main_window(app) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", tr("tray.open"), true, None::<&str>)?;
    let poll = MenuItem::with_id(app, "poll", tr("tray.poll"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr("tray.quit"), true, None::<&str>)?;
    Menu::with_items(app, &[&open, &poll, &quit])
}

/// Swap the menu for one built with the current language.
pub fn refresh_menu(app: &AppHandle) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_menu(app)?))?;
    }
    Ok(())
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("bundle icon missing"))
        .tooltip("GitBell")
        .menu(&menu)
        // left click should open the window, not the menu (menu stays on right click)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            // frontend listens for this and kicks an immediate poll
            "poll" => {
                let _ = app.emit("poll-now", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Swap the tray icon through the sprite frames, then put the logo back.
/// Runs on its own thread: `invoke` from the webview must not block.
#[tauri::command]
pub fn ring_tray(app: AppHandle) {
    if RINGING.swap(true, Ordering::SeqCst) {
        return; // already ringing, ignore
    }
    std::thread::spawn(move || {
        let Some(tray) = app.tray_by_id(TRAY_ID) else {
            RINGING.store(false, Ordering::SeqCst);
            return;
        };
        for _ in 0..RING_LOOPS {
            for bytes in FRAMES {
                if let Ok(img) = Image::from_bytes(bytes) {
                    let _ = tray.set_icon(Some(img));
                }
                std::thread::sleep(Duration::from_millis(FRAME_MS));
            }
        }
        let _ = tray.set_icon(app.default_window_icon().cloned());
        RINGING.store(false, Ordering::SeqCst);
    });
}
