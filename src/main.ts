// Entry point. Wires settings <-> UI <-> poller and listens to the tray.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initLang } from "./core/i18n";
import { Poller } from "./core/poller";
import type { Notice } from "./core/types";
import { markUnread } from "./platform/notify";
import { playSound } from "./platform/sounds";
import { getToken } from "./platform/secrets";
import { loadRecent, loadSettings, saveRecent, saveSettings } from "./platform/settings";
import { Onboarding } from "./ui/onboarding";
import { Ui, applyGlass } from "./ui/ui";

async function boot(): Promise<void> {
  // `pnpm dev` opened in a plain browser: no Tauri, no keyring, no store.
  // Render the onboarding with fake data so the UI can be inspected there.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { preview } = await import("./ui/preview");
    preview();
    return;
  }
  const settings = await loadSettings();
  const recent = await loadRecent();
  applyGlass(settings.glass);
  // language first: everything rendered after this reads the dictionary
  const lang = initLang(settings.language, navigator.language);
  invoke("set_language", { lang }).catch((e) => console.warn("set_language", e));
  let token: string | null = null;
  try {
    token = await getToken();
  } catch (e) {
    console.warn("keyring unavailable", e);
  }

  // declared with `let` so the UI handlers can reference it before it's built
  let poller: Poller;
  let onboarding: Onboarding;
  let current = settings;

  const ui = new Ui(settings, recent, token !== null, {
    async onSettingsChange(next) {
      current = next;
      await saveSettings(next);
      poller.update(next);
    },
    async onTokenChange(next) {
      token = next;
      poller.setToken(next);
    },
    onPollNow: () => poller.pollNow(),
    onReplayOnboarding: () => onboarding.open(),
    token: () => token,
  });
  ui.mount();

  onboarding = new Onboarding({
    settings: () => current,
    token: () => token,
    async saveSettings(next) {
      current = next;
      await saveSettings(next);
      poller.update(next);
    },
    async saveToken(next, profile) {
      token = next;
      current = { ...current, ...profile };
      await saveSettings(current);
      poller.setToken(next);
    },
    onDone: () => ui.refresh(current, token !== null),
    ringMascot: () => ui.ringMascot(),
  });

  // first run, or an install that predates the flow: step 1 recognizes an
  // existing token and skips straight to targets, so it costs one click.
  if (!settings.onboarded) onboarding.open();

  poller = new Poller(settings, token, {
    onStatus: (s) => ui.setStatus(s),
    onNotices: (list) => {
      ui.pushNotices(list);
      void saveRecent(ui.getRecent());
    },
  });
  await poller.start();

  // tray menu "Revisar ahora" emits this from Rust (see lib.rs)
  await listen("poll-now", () => poller.pollNow());

  // `gitbell notify ...` from a script: Rust already showed the toast and
  // rang the tray; here we add it to the list and play the category sound
  await listen<{ title: string; body: string; url: string | null }>("external-notice", (e) => {
    const n: Notice = {
      id: `ext-${Date.now()}`,
      category: "external",
      title: e.payload.title,
      body: e.payload.body,
      url: e.payload.url ?? "",
      actor: "cli",
      avatar: "",
      repo: "",
      at: new Date().toISOString(),
    };
    const s = ui.currentSettings();
    if (s.events.external) {
      markUnread(1);
      ui.pushNotices([n]);
      void saveRecent(ui.getRecent());
      if (s.soundsEnabled) void playSound(s.sounds.external, s.volume);
    }
  });
}

boot().catch((e) => {
  console.error("boot failed", e);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="fatal">GitBell no pudo arrancar: ${e instanceof Error ? e.message : e}</p>`,
  );
});
