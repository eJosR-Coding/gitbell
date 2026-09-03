//! Real glass: ask the compositor to blur whatever is behind our window.
//!
//! Tauri can make the window transparent, but "blur what's behind" is a
//! per-compositor favor an app has to request. On Wayland we speak two
//! protocols: KDE's `org_kde_kwin_blur_manager` (Plasma <= 6.6) and the
//! standard `ext_background_effect_v1` (Plasma 6.7+, Niri). We reuse the
//! wl_display/wl_surface GTK already owns, so no second connection.
//! Windows/macOS use Tauri's native vibrancy crate instead (todo).

#[cfg(target_os = "linux")]
mod linux {
    use std::sync::Mutex;

    use gtk::prelude::*;
    use glib::translate::ToGlibPtr;
    use wayland_client::{
        backend::{Backend, ObjectId},
        globals::registry_queue_init,
        protocol::{wl_registry, wl_surface::WlSurface},
        Connection, Dispatch, Proxy, QueueHandle,
    };
    use wayland_protocols::ext::background_effect::v1::client::{
        ext_background_effect_manager_v1::ExtBackgroundEffectManagerV1,
        ext_background_effect_surface_v1::ExtBackgroundEffectSurfaceV1,
    };
    use wayland_protocols_plasma::blur::client::{
        org_kde_kwin_blur::OrgKdeKwinBlur, org_kde_kwin_blur_manager::OrgKdeKwinBlurManager,
    };

    /// One wrapper around GTK's display for the whole process. Wrapping the
    /// same foreign display twice is asking for trouble.
    static CONN: Mutex<Option<Connection>> = Mutex::new(None);
    /// The effect object must stay alive or the compositor drops it. GTK
    /// destroys the wl_surface when the window hides, so we make a fresh one
    /// on every show and let the old proxy go.
    static EFFECT: Mutex<Option<Effect>> = Mutex::new(None);
    #[allow(dead_code)] // held only to keep the compositor object alive
    enum Effect {
        Ext(ExtBackgroundEffectSurfaceV1),
        Kde(OrgKdeKwinBlur),
    }

    struct State;
    impl Dispatch<wl_registry::WlRegistry, wayland_client::globals::GlobalListContents> for State {
        fn event(
            _: &mut Self,
            _: &wl_registry::WlRegistry,
            _: wl_registry::Event,
            _: &wayland_client::globals::GlobalListContents,
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
        }
    }
    wayland_client::delegate_noop!(State: ignore ExtBackgroundEffectManagerV1);
    wayland_client::delegate_noop!(State: ignore ExtBackgroundEffectSurfaceV1);
    wayland_client::delegate_noop!(State: ignore OrgKdeKwinBlurManager);
    wayland_client::delegate_noop!(State: ignore OrgKdeKwinBlur);
    wayland_client::delegate_noop!(State: ignore WlSurface);

    /// Must run on the main thread after the window is shown (realized).
    /// Safe to call on every show.
    pub fn enable(window: &tauri::WebviewWindow) -> Result<&'static str, String> {
        let gtk_win = window.gtk_window().map_err(|e| e.to_string())?;
        let gdk_win = gtk_win.window().ok_or("window not realized yet")?;
        let display = gdk_win.display();

        // GTK hands us raw libwayland pointers; null means X11/XWayland
        let display_ptr: *mut gdk::ffi::GdkDisplay = display.to_glib_none().0;
        let window_ptr: *mut gdk::ffi::GdkWindow = gdk_win.to_glib_none().0;
        let wl_display = unsafe {
            gdk_wayland_sys::gdk_wayland_display_get_wl_display(display_ptr as *mut _)
        };
        let wl_surface = unsafe {
            gdk_wayland_sys::gdk_wayland_window_get_wl_surface(window_ptr as *mut _)
        };
        if wl_display.is_null() || wl_surface.is_null() {
            return Err("not a native Wayland window".into());
        }

        let conn = {
            let mut slot = CONN.lock().unwrap();
            if slot.is_none() {
                let backend = unsafe { Backend::from_foreign_display(wl_display as *mut _) };
                *slot = Some(Connection::from_backend(backend));
            }
            slot.as_ref().unwrap().clone()
        };
        let (globals, queue) = registry_queue_init::<State>(&conn).map_err(|e| e.to_string())?;
        let qh = queue.handle();

        let surface_id = unsafe { ObjectId::from_ptr(WlSurface::interface(), wl_surface as *mut _) }
            .map_err(|e| e.to_string())?;
        let surface = WlSurface::from_id(&conn, surface_id).map_err(|e| e.to_string())?;

        // standard protocol first, KDE's legacy one as fallback
        let (effect, which) = if let Ok(mgr) = globals.bind::<ExtBackgroundEffectManagerV1, _, _>(&qh, 1..=1, ()) {
            let eff = mgr.get_background_effect(&surface, &qh, ());
            eff.set_blur_region(None); // null region = the whole surface
            (Effect::Ext(eff), "ext_background_effect_v1")
        } else if let Ok(mgr) = globals.bind::<OrgKdeKwinBlurManager, _, _>(&qh, 1..=1, ()) {
            let blur = mgr.create(&surface, &qh, ());
            blur.commit();
            (Effect::Kde(blur), "org_kde_kwin_blur_manager")
        } else {
            return Err("compositor offers no blur protocol".into());
        };
        // GTK commits the surface on its next frame; nudge one now so the
        // effect shows without waiting for a repaint
        surface.commit();
        conn.flush().map_err(|e| e.to_string())?;

        *EFFECT.lock().unwrap() = Some(effect);
        Ok(which)
    }
}

#[cfg(target_os = "linux")]
pub use linux::enable;

#[cfg(target_os = "windows")]
pub fn enable(window: &tauri::WebviewWindow) -> Result<&'static str, String> {
    // acrylic on 10/11; the tint comes from CSS, keep the native one faint
    window_vibrancy::apply_acrylic(window, Some((0, 0, 0, 10))).map_err(|e| e.to_string())?;
    Ok("acrylic")
}

#[cfg(target_os = "macos")]
pub fn enable(window: &tauri::WebviewWindow) -> Result<&'static str, String> {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, None, None).map_err(|e| e.to_string())?;
    Ok("vibrancy")
}
