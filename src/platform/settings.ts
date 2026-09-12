// Persistence via tauri-plugin-store. Two files on disk:
//   settings.json -> what the user configured
//   state.json    -> runtime memory (last seen event ids, recent notices)
// Splitting them means "reset config" never nukes the dedupe state and viceversa.

import { load, type Store } from "@tauri-apps/plugin-store";
import { DEFAULT_SETTINGS, type Notice, type Settings } from "../core/types";
import { setToken } from "./secrets";

let settingsStore: Store | null = null;
let stateStore: Store | null = null;

async function stores() {
  // lazy init, both files land in the app's config dir (~/.config/dev.ejos.gitbell on linux)
  settingsStore ??= await load("settings.json", { autoSave: true });
  stateStore ??= await load("state.json", { autoSave: true });
  return { settingsStore, stateStore };
}

export async function loadSettings(): Promise<Settings> {
  const { settingsStore } = await stores();
  const saved =
    (await settingsStore.get<Partial<Settings> & { token?: string }>("settings")) ?? {};

  // v0.1.0 kept the token in this JSON. Move it to the keyring once and
  // scrub it from disk.
  if (saved.token) {
    try {
      await setToken(saved.token);
      delete saved.token;
      await settingsStore.set("settings", saved);
    } catch (e) {
      console.warn("token migration failed, leaving it in place", e);
    }
  }
  // merge over defaults so adding a new key later never explodes on old installs
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    events: { ...DEFAULT_SETTINGS.events, ...(saved.events ?? {}) },
    sounds: { ...DEFAULT_SETTINGS.sounds, ...(saved.sounds ?? {}) },
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  const { settingsStore } = await stores();
  await settingsStore.set("settings", s);
}

/** target -> newest event id we've already processed */
export async function loadLastSeen(): Promise<Record<string, string>> {
  const { stateStore } = await stores();
  return (await stateStore.get<Record<string, string>>("lastSeen")) ?? {};
}

export async function saveLastSeen(map: Record<string, string>): Promise<void> {
  const { stateStore } = await stores();
  await stateStore.set("lastSeen", map);
}

const MAX_RECENT = 40;

export async function loadRecent(): Promise<Notice[]> {
  const { stateStore } = await stores();
  return (await stateStore.get<Notice[]>("recent")) ?? [];
}

export async function saveRecent(list: Notice[]): Promise<void> {
  const { stateStore } = await stores();
  await stateStore.set("recent", list.slice(0, MAX_RECENT));
}
