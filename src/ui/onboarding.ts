// First-run flow. Three steps, each one is the real setup (token, targets,
// first notification), never a slide. Skippable from every step.
//
// Mascot: every step has a `.pose` slot with a `data-pose` attribute. Until
// the dedicated pose images exist, CSS shows the first bell frame in every
// slot. Swapping in the real art is a CSS-only change (see styles.css,
// "MASCOT POSES").

import { openUrl } from "@tauri-apps/plugin-opener";
import { enable as enableAutostart } from "@tauri-apps/plugin-autostart";
import { toNotice } from "../core/format";
import { fetchLatestEvent, fetchSuggestions, isValidTarget, whoAmI } from "../core/github";
import { applyStatic, t } from "../core/i18n";
import type { Notice, Settings } from "../core/types";
import { ringTray, toast } from "../platform/notify";
import { setToken } from "../platform/secrets";
import { playSound } from "../platform/sounds";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo,read:org&description=GitBell";

export interface OnboardingDeps {
  settings: () => Settings;
  token: () => string | null;
  /** persist + hot-swap the poller */
  saveSettings(next: Settings): Promise<void>;
  /** token verified: store it and tell the poller */
  saveToken(token: string, login: string): Promise<void>;
  /** flow finished or skipped */
  onDone(): void;
  ringMascot(): void;
}

type Step = 1 | 2 | 3;

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`onboarding: missing ${sel}`);
  return el;
};

export class Onboarding {
  private root: HTMLElement;
  private selected = new Set<string>();
  private latest: Notice | null = null;

  constructor(private d: OnboardingDeps) {
    this.root = document.getElementById("onboarding") as HTMLElement;
  }

  open(): void {
    applyStatic(this.root);
    this.root.hidden = false;
    document.body.classList.add("onboarding-open");
    this.selected = new Set(this.d.settings().targets.length ? this.d.settings().targets : ["@me"]);
    this.bindOnce();
    this.go(1, "none");
  }

  close(): void {
    this.root.hidden = true;
    document.body.classList.remove("onboarding-open");
    this.d.onDone();
  }

  private bound = false;
  private bindOnce(): void {
    if (this.bound) return;
    this.bound = true;
    const r = this.root;

    $(r, "#ob-skip").addEventListener("click", () => void this.finish());

    // step 1
    const tokenInput = $<HTMLInputElement>(r, "#ob-token");
    $(r, "#ob-create-token").addEventListener("click", () => void openUrl(TOKEN_URL));
    $(r, "#ob-verify").addEventListener("click", () => void this.verify(tokenInput.value.trim()));
    tokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.verify(tokenInput.value.trim());
    });
    $(r, "#ob-s1-next").addEventListener("click", () => this.go(2));

    // step 2
    const manual = $<HTMLInputElement>(r, "#ob-manual");
    const addManual = () => {
      const v = manual.value.trim();
      if (!isValidTarget(v)) {
        manual.setCustomValidity(t("targets.invalid"));
        manual.reportValidity();
        return;
      }
      manual.setCustomValidity("");
      this.selected.add(v);
      manual.value = "";
      this.renderChips();
    };
    manual.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addManual();
    });
    $(r, "#ob-manual-add").addEventListener("click", addManual);
    $(r, "#ob-s2-back").addEventListener("click", () => this.go(1, "back"));
    $(r, "#ob-s2-next").addEventListener("click", () => void this.commitTargets());

    // step 3
    $(r, "#ob-ring").addEventListener("click", () => void this.ring());
    $(r, "#ob-s3-back").addEventListener("click", () => this.go(2, "back"));
    $(r, "#ob-done").addEventListener("click", () => void this.finish(true));
  }

  private go(step: Step, dir: "next" | "back" | "none" = "next"): void {
    const r = this.root;
    r.dataset.step = String(step);
    r.dataset.dir = dir;
    $(r, "#ob-progress").setAttribute("aria-valuenow", String(step));
    $(r, "#ob-step-label").textContent = t("ob.stepOf", { n: step });
    r.querySelectorAll<HTMLElement>(".ob-step").forEach((el) => {
      el.hidden = el.dataset.step !== String(step);
    });
    if (step === 1) this.prepareStep1();
    if (step === 2) void this.prepareStep2();
    if (step === 3) void this.prepareStep3();
  }

  // ---- step 1: token ------------------------------------------------------

  private prepareStep1(): void {
    const r = this.root;
    const login = this.d.settings().login;
    const connected = this.d.token() !== null && login !== null;
    $(r, "#ob-s1-form").hidden = connected;
    $(r, "#ob-s1-connected").hidden = !connected;
    if (connected) $(r, "#ob-s1-already").textContent = t("ob.s1.already", { login: login! });
    if (!connected) setTimeout(() => $<HTMLInputElement>(r, "#ob-token").focus(), 50);
  }

  private async verify(token: string): Promise<void> {
    const r = this.root;
    const status = $(r, "#ob-s1-status");
    const btn = $<HTMLButtonElement>(r, "#ob-verify");
    if (!token) {
      status.textContent = t("account.pasteFirst");
      status.dataset.kind = "error";
      return;
    }
    btn.disabled = true;
    status.dataset.kind = "info";
    status.textContent = t("account.verifying");
    try {
      const login = await whoAmI(token);
      await setToken(token);
      await this.d.saveToken(token, login);
      status.dataset.kind = "ok";
      status.textContent = t("ob.s1.hello", { login });
      this.say(1, t("ob.s1.hello", { login }));
      this.d.ringMascot();
      $<HTMLInputElement>(r, "#ob-token").value = "";
      // let the greeting land, then move on
      setTimeout(() => this.go(2), 900);
    } catch (e) {
      status.dataset.kind = "error";
      status.textContent = t("account.invalid", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      btn.disabled = false;
    }
  }

  // ---- step 2: targets ----------------------------------------------------

  private suggestions: { repos: string[]; orgs: string[] } | null = null;

  private async prepareStep2(): Promise<void> {
    const r = this.root;
    const token = this.d.token();
    const loading = $(r, "#ob-s2-loading");
    if (!this.suggestions && token) {
      loading.hidden = false;
      try {
        this.suggestions = await fetchSuggestions(token);
      } catch (e) {
        console.warn("suggestions", e);
        this.suggestions = { repos: [], orgs: [] };
      }
      loading.hidden = true;
    }
    this.renderChips();
  }

  private renderChips(): void {
    const r = this.root;
    const s = this.suggestions ?? { repos: [], orgs: [] };
    const make = (target: string, label = target) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ob-chip";
      b.textContent = label;
      b.setAttribute("aria-pressed", String(this.selected.has(target)));
      b.addEventListener("click", () => {
        if (this.selected.has(target)) this.selected.delete(target);
        else this.selected.add(target);
        b.setAttribute("aria-pressed", String(this.selected.has(target)));
        $<HTMLButtonElement>(r, "#ob-s2-next").disabled = this.selected.size === 0;
      });
      return b;
    };
    $(r, "#ob-me").replaceChildren(make("@me", t("ob.s2.me")));
    const known = new Set([...s.repos, ...s.orgs, "@me"]);
    const extra = [...this.selected].filter((x) => !known.has(x));
    $(r, "#ob-repos").replaceChildren(...s.repos.map((x) => make(x)), ...extra.map((x) => make(x)));
    $(r, "#ob-orgs").replaceChildren(...s.orgs.map((x) => make(x)));
    $(r, "#ob-orgs-block").hidden = s.orgs.length === 0;
    $(r, "#ob-s2-none").hidden = !(this.suggestions && s.repos.length === 0 && s.orgs.length === 0);
    $<HTMLButtonElement>(r, "#ob-s2-next").disabled = this.selected.size === 0;
  }

  private async commitTargets(): Promise<void> {
    const targets = [...this.selected];
    await this.d.saveSettings({ ...this.d.settings(), targets });
    this.go(3);
  }

  // ---- step 3: first notification ----------------------------------------

  private async prepareStep3(): Promise<void> {
    const r = this.root;
    const token = this.d.token();
    const { login, targets } = this.d.settings();
    // prefer a concrete repo over @me: its latest event is more "yours"
    const target = targets.find((x) => x !== "@me") ?? targets[0] ?? "@me";
    const card = $(r, "#ob-latest");
    card.hidden = true;
    $(r, "#ob-s3-loading").hidden = false;
    this.latest = null;
    this.say(3, t("ob.s3.loading"));
    try {
      const ev = token ? await fetchLatestEvent(target, token, login) : null;
      this.latest = ev ? toNotice(ev) : null;
    } catch (e) {
      console.warn("latest", e);
    }
    $(r, "#ob-s3-loading").hidden = true;
    const label = target === "@me" ? t("ob.s2.me").toLowerCase() : target;
    if (this.latest) {
      $(r, "#ob-latest-title").textContent = this.latest.title;
      $(r, "#ob-latest-body").textContent = this.latest.body;
      $(r, "#ob-latest-time").textContent = new Date(this.latest.at).toLocaleString([], {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });
      card.hidden = false;
      this.say(3, t("ob.s3.say", { target: label }));
    } else {
      this.say(3, t("ob.s3.sayEmpty", { target: label }));
    }
  }

  private async ring(): Promise<void> {
    const s = this.d.settings();
    const n = this.latest;
    ringTray();
    this.d.ringMascot();
    await toast(n?.title ?? t("test.title"), n?.body ?? t("test.body"), n?.url ?? "https://github.com");
    if (s.soundsEnabled) await playSound(s.sounds[n?.category ?? "push"], s.volume);
  }

  private async finish(completed = false): Promise<void> {
    const r = this.root;
    if (completed && $<HTMLInputElement>(r, "#ob-autostart").checked) {
      try {
        await enableAutostart();
      } catch (e) {
        console.warn("autostart", e);
      }
    }
    await this.d.saveSettings({ ...this.d.settings(), onboarded: true });
    this.close();
  }

  /** Dev preview only: jump to a step with canned data, no network. */
  __previewJump(step: 2 | 3, data: { suggestions: { repos: string[]; orgs: string[] }; latest: Notice | null }): void {
    this.suggestions = data.suggestions;
    this.latest = data.latest;
    this.selected = new Set(this.d.settings().targets);
    const r = this.root;
    r.dataset.step = String(step);
    r.dataset.dir = "none";
    $(r, "#ob-step-label").textContent = t("ob.stepOf", { n: step });
    r.querySelectorAll<HTMLElement>(".ob-step").forEach((el) => { el.hidden = el.dataset.step !== String(step); });
    if (step === 2) this.renderChips();
    if (step === 3) {
      $(r, "#ob-s3-loading").hidden = true;
      const n = data.latest;
      if (n) {
        $(r, "#ob-latest-title").textContent = n.title;
        $(r, "#ob-latest-body").textContent = n.body;
        $(r, "#ob-latest-time").textContent = "hace 2 h";
        $(r, "#ob-latest").hidden = false;
        this.say(3, t("ob.s3.say", { target: "eJosR-Coding/gitbell" }));
      } else {
        this.say(3, t("ob.s3.sayEmpty", { target: "eJosR-Coding/gitbell" }));
      }
    }
  }

  // ---- mascot line --------------------------------------------------------

  private say(step: Step, text: string): void {
    const el = this.root.querySelector<HTMLElement>(`.ob-step[data-step="${step}"] .ob-say`);
    if (el) el.textContent = text;
  }
}

