// Dev-only. Boots the UI in a normal browser (http://localhost:1420) with
// fake data so layout and copy can be inspected without Tauri.
//   #ob=1|2|3   open onboarding at that step
//   #ob=1c      step 1 with an existing token ("already connected")
//   (no hash)   the settings view with an empty activity list

import { initLang } from "../core/i18n";
import { DEFAULT_SETTINGS, type Settings } from "../core/types";
import { Onboarding } from "./onboarding";
import { Ui } from "./ui";

export function preview(): void {
  initLang("auto", navigator.language);
  const hash = new URLSearchParams(location.hash.slice(1));
  const ob = hash.get("ob");
  const connected = ob?.endsWith("c") ?? false;
  const step = Number((ob ?? "1").replace("c", "")) || 1;

  let settings: Settings = { ...DEFAULT_SETTINGS, login: connected ? "ejos" : null, targets: ["@me"] };
  let token: string | null = connected || step > 1 ? "preview" : null;

  const ui = new Ui(settings, [], token !== null, {
    async onSettingsChange(next) { settings = next; },
    async onTokenChange(next) { token = next; },
    onPollNow() {},
    onReplayOnboarding: () => onboarding.open(),
  });
  ui.mount();
  ui.setStatus({ kind: "ok", at: new Date(), remaining: 4987 });

  const onboarding = new Onboarding({
    settings: () => settings,
    token: () => token,
    async saveSettings(next) { settings = next; },
    async saveToken(next, login) { token = next; settings = { ...settings, login }; },
    onDone: () => ui.refresh(settings, token !== null),
    ringMascot: () => ui.ringMascot(),
  });

  if (ob) {
    onboarding.open();
    if (step > 1) {
      settings = { ...settings, login: "ejos", targets: ["@me", "eJosR-Coding/gitbell"] };
      onboarding.__previewJump(step as 2 | 3, {
        suggestions: {
          repos: ["eJosR-Coding/gitbell", "eJosR-Coding/resume_matcher", "fourlayer/app", "tauri-apps/tauri"],
          orgs: ["org:fourlayer"],
        },
        latest: {
          id: "1", category: "push", title: "ana hizo push a eJosR-Coding/gitbell",
          body: "2 commits en main: feat(i18n): spanish and english UI", url: "https://github.com/eJosR-Coding/gitbell",
          actor: "ana", avatar: "", repo: "eJosR-Coding/gitbell", at: new Date(Date.now() - 7200e3).toISOString(),
        },
      });
    }
  }
}
