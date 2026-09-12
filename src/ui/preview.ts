// Dev-only. Boots the UI in a normal browser (http://localhost:1420) with
// fake data so layout and copy can be inspected without Tauri.
//   #ob=1|2|3   open onboarding at that step
//   #ob=1c      step 1 with an existing token ("already connected")
//   #view=settings   the settings view
//   #notoken    activity view without a token (asleep callout)
//   (no hash)   the activity view with a couple of notices

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

  const noToken = hash.has("notoken");
  const identity = { login: "eJosR-Coding", name: "Joseph Rodriguez", avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4" };
  let settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(noToken ? {} : identity),
    ...(connected ? { login: "ejos" } : {}),
    targets: ["@me", "eJosR-Coding/gitbell"],
    onboarded: true,
  };
  let token: string | null = noToken ? null : "preview";

  const recent = noToken ? [] : [
    { id: "3", category: "pr" as const, title: "ana abrió PR #12 en eJosR-Coding/gitbell", body: "feat(home): activity first, settings second", url: "https://github.com/eJosR-Coding/gitbell/pull/12", actor: "ana", avatar: "https://avatars.githubusercontent.com/u/583231?v=4", repo: "eJosR-Coding/gitbell", at: new Date(Date.now() - 12 * 60e3).toISOString() },
    { id: "2", category: "external" as const, title: "Claude Code terminó", body: "/home/ejos/Documents/proyectos_code/gitbell", url: "", actor: "cli", avatar: "", repo: "", at: new Date(Date.now() - 55 * 60e3).toISOString() },
    { id: "1", category: "push" as const, title: "ana hizo push a eJosR-Coding/gitbell", body: "2 commits en main: feat(i18n): spanish and english UI", url: "https://github.com/eJosR-Coding/gitbell", actor: "ana", avatar: "https://avatars.githubusercontent.com/u/583231?v=4", repo: "eJosR-Coding/gitbell", at: new Date(Date.now() - 7200e3).toISOString() },
  ];

  const ui = new Ui(settings, recent, token !== null, {
    async onSettingsChange(next) { settings = next; },
    async onTokenChange(next) { token = next; },
    onPollNow() {},
    onReplayOnboarding: () => onboarding.open(),
    token: () => token,
  });
  ui.mount();
  ui.setStatus(noToken ? { kind: "error", message: "Falta el token de GitHub" } : { kind: "ok", at: new Date(), remaining: 4987 });
  if (hash.get("view") === "settings") ui.setView("settings");

  const onboarding = new Onboarding({
    settings: () => settings,
    token: () => token,
    async saveSettings(next) { settings = next; },
    async saveToken(next, profile) { token = next; settings = { ...settings, ...profile }; },
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
