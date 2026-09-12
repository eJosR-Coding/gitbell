// Entry point. Wires settings <-> UI <-> poller and listens to the tray.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initLang } from "./core/i18n";
import { Poller } from "./core/poller";
import type { Notice } from "./core/types";
import { playSound } from "./platform/sounds";
import { getToken } from "./platform/secrets";
import { loadRecent, loadSettings, saveRecent, saveSettings } from "./platform/settings";
import { Ui } from "./ui/ui";

async function boot(): Promise<void> {
  const settings = await loadSettings();
  const recent = await loadRecent();
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

  const ui = new Ui(settings, recent, token !== null, {
    async onSettingsChange(next) {
      await saveSettings(next);
      poller.update(next);
    },
    async onTokenChange(next) {
      poller.setToken(next);
    },
    onPollNow: () => poller.pollNow(),
  });
  ui.mount();

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
