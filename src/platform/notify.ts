// OS-level toasts. We go through our own Rust command (`notify` in lib.rs)
// instead of calling the notification plugin from JS: on Linux that lets us
// set the app name, the desktop-entry hint and a click-to-open action, none
// of which the plugin exposes to the frontend.

import { invoke } from "@tauri-apps/api/core";

export async function toast(title: string, body: string, url?: string): Promise<void> {
  try {
    await invoke("notify", { title, body, url: url ?? null });
  } catch (e) {
    console.warn("notify failed", e);
  }
}

/** Make the tray mascot ring its bell. Rust owns the frames, see lib.rs. */
export function ringTray(): void {
  invoke("ring_tray").catch((e) => console.warn("ring_tray failed", e));
}

/** Tell the tray how many notices just arrived; Rust decides if they're unread. */
export function markUnread(count: number): void {
  invoke("mark_unread", { count }).catch((e) => console.warn("mark_unread failed", e));
}
