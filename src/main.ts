// Entry point. Wires settings <-> UI <-> poller and listens to the tray.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initLang } from "./core/i18n";
import { Poller } from "./core/poller";
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
}

boot().catch((e) => {
  console.error("boot failed", e);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="fatal">GitBell no pudo arrancar: ${e instanceof Error ? e.message : e}</p>`,
  );
});
