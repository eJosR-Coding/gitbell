// Sound playback. Lives in the webview because the notification plugin's
// `sound` field only accepts freedesktop theme names, not files. The
// webview keeps running while the window is hidden, and wry enables
// autoplay by default, so `new Audio().play()` works without a click.

import { convertFileSrc } from "@tauri-apps/api/core";
import sound1 from "../assets/sounds/sound1.ogg";
import sound2 from "../assets/sounds/sound2.ogg";

/** Built-in sounds bundled with the app. Add a file + a row here to extend. */
export const BUILTIN_SOUNDS = {
  sound1: { label: "Sonido 1", url: sound1 },
  sound2: { label: "Sonido 2", url: sound2 },
} as const;

export type BuiltinSoundId = keyof typeof BUILTIN_SOUNDS;

/**
 * What a category can point to:
 *   "none"            -> silent
 *   "sound1"/"sound2" -> bundled
 *   "file:/abs/path"  -> user-picked file, served through Tauri's asset protocol
 */
export type SoundRef = "none" | BuiltinSoundId | `file:${string}`;

export function isBuiltin(ref: SoundRef): ref is BuiltinSoundId {
  return ref in BUILTIN_SOUNDS;
}

export function customPath(ref: SoundRef): string | null {
  return ref.startsWith("file:") ? ref.slice(5) : null;
}

function urlFor(ref: SoundRef): string | null {
  if (ref === "none") return null;
  if (isBuiltin(ref)) return BUILTIN_SOUNDS[ref].url;
  const path = customPath(ref);
  // asset:// (linux/mac) or http://asset.localhost (windows), tauri picks
  return path ? convertFileSrc(path) : null;
}

/** Fire and forget. Resolves when playback ends so callers can stagger toasts. */
export function playSound(ref: SoundRef, volume: number): Promise<void> {
  const url = urlFor(ref);
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.volume = Math.min(1, Math.max(0, volume));
    a.addEventListener("ended", () => resolve(), { once: true });
    a.addEventListener("error", () => {
      console.warn("sound failed", ref, a.error);
      resolve();
    }, { once: true });
    a.play().catch((e) => {
      console.warn("sound play() rejected", ref, e);
      resolve();
    });
  });
}
