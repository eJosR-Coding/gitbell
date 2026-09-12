// DOM glue. No framework: the page is small enough that querySelector + a
// few render functions beat pulling in React.
//
// Two views live in one document: "activity" (what happened, who you are)
// and "settings". Sections carry data-view and only one is shown at a time.

import { openUrl } from "@tauri-apps/plugin-opener";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { deleteToken, setToken } from "../platform/secrets";
import { fetchSuggestions, isValidTarget, whoAmI, type Suggestions } from "../core/github";
import { ringTray, toast } from "../platform/notify";
import { BUILTIN_SOUNDS, builtinLabel, customPath, playSound, type BuiltinSoundId, type SoundRef } from "../platform/sounds";
import { applyStatic, initLang, t, type LangSetting } from "../core/i18n";
import {
  ALL_CATEGORIES,
  categoryLabel,
  type EventCategory,
  type Notice,
  type PollStatus,
  type Settings,
} from "../core/types";

export type View = "activity" | "settings";

/** Push the tint opacity into CSS. 1 = opaque. */
export function applyGlass(opacity: number): void {
  document.documentElement.style.setProperty("--glass", String(Math.min(1, Math.max(0.3, opacity))));
}

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

export interface UiHandlers {
  onSettingsChange(next: Settings): Promise<void>;
  /** null = disconnected */
  onTokenChange(token: string | null): Promise<void>;
  onPollNow(): void;
  onReplayOnboarding(): void;
  token(): string | null;
}

export class Ui {
  private settings: Settings;
  private recent: Notice[] = [];
  private lastStatus: PollStatus = { kind: "idle" };
  private suggestions: Suggestions | null = null;

  constructor(
    settings: Settings,
    recent: Notice[],
    private hasToken: boolean,
    private h: UiHandlers,
  ) {
    this.settings = settings;
    this.recent = recent;
  }

  mount(): void {
    applyStatic();
    this.bindViews();
    this.bindAccount();
    this.bindTargets();
    this.bindNotify();
    this.bindOptions();
    this.renderAll();
    $("#poll-now").addEventListener("click", () => this.h.onPollNow());
    $("#no-token-cta").addEventListener("click", () => {
      this.setView("settings");
      $<HTMLInputElement>("#token").focus();
    });
    $("#replay-onboarding").addEventListener("click", () => this.h.onReplayOnboarding());
    void this.syncAutostart();
  }

  /** Everything derived from state, in one place. Cheap enough to call often. */
  private renderAll(): void {
    this.renderIdentity();
    this.renderTargets();
    this.renderNotifyRows();
    this.renderRecent();
    this.setStatus(this.lastStatus);
  }

  // ---- views -------------------------------------------------------------

  private bindViews(): void {
    document.querySelectorAll<HTMLButtonElement>(".views [data-view]").forEach((b) => {
      b.addEventListener("click", () => this.setView(b.dataset.view as View));
    });
    this.setView("activity");
  }

  setView(view: View): void {
    document.body.dataset.view = view;
    document.querySelectorAll<HTMLElement>("main .view").forEach((s) => {
      s.hidden = s.dataset.view !== view;
    });
    document.querySelectorAll<HTMLButtonElement>(".views [data-view]").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.view === view));
    });
    if (view === "settings") void this.loadSuggestions();
    window.scrollTo({ top: 0 });
  }

  // ---- identity (activity strip + account card) --------------------------

  private renderIdentity(): void {
    const { login, name, avatarUrl } = this.settings;
    const connected = this.hasToken && !!login;
    $("#identity").hidden = !connected;
    $("#no-token").hidden = connected;
    $("#account-connected").hidden = !connected;
    $("#account-form").hidden = connected && !this.changingToken;
    $("#token-cancel").hidden = !connected;
    if (connected) {
      for (const [img, nameEl, loginEl] of [["#id-avatar", "#id-name", "#id-login"], ["#acc-avatar", "#acc-name", "#acc-login"]]) {
        const i = $<HTMLImageElement>(img);
        i.hidden = !avatarUrl;
        if (avatarUrl) i.src = `${avatarUrl}&s=96`;
        $(nameEl).textContent = name || login!;
        $(loginEl).textContent = `@${login}`;
      }
    }
  }

  private changingToken = false;

  private bindAccount(): void {
    const input = $<HTMLInputElement>("#token");
    const status = $("#token-status");

    $("#acc-change").addEventListener("click", () => {
      this.changingToken = true;
      this.renderIdentity();
      input.focus();
    });
    $("#token-cancel").addEventListener("click", () => {
      this.changingToken = false;
      input.value = "";
      status.textContent = "";
      this.renderIdentity();
    });
    $("#acc-disconnect").addEventListener("click", async () => {
      await deleteToken();
      this.hasToken = false;
      this.suggestions = null;
      await this.h.onTokenChange(null);
      await this.commit({ ...this.settings, login: null, name: null, avatarUrl: null });
      this.renderAll();
    });

    const save = async () => {
      const token = input.value.trim();
      if (!token) {
        status.textContent = t("account.pasteFirst");
        return;
      }
      status.textContent = t("account.verifying");
      try {
        const profile = await whoAmI(token);
        await setToken(token);
        await this.h.onTokenChange(token);
        this.hasToken = true;
        this.changingToken = false;
        this.suggestions = null;
        input.value = "";
        status.textContent = "";
        await this.commit({ ...this.settings, ...profile });
        this.renderAll();
      } catch (e) {
        status.textContent = t("account.invalid", { error: e instanceof Error ? e.message : String(e) });
      }
    };
    $("#token-save").addEventListener("click", () => void save());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void save();
    });
  }

  // ---- targets -----------------------------------------------------------

  private bindTargets(): void {
    const input = $<HTMLInputElement>("#target-input");
    const add = async () => {
      const value = input.value.trim();
      if (!isValidTarget(value)) {
        input.setCustomValidity(t("targets.invalid"));
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      await this.addTarget(value);
      input.value = "";
    };
    $("#target-add").addEventListener("click", () => void add());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void add();
    });
  }

  private async addTarget(target: string): Promise<void> {
    if (this.settings.targets.includes(target)) return;
    await this.commit({ ...this.settings, targets: [...this.settings.targets, target] });
    this.renderTargets();
  }

  private async removeTarget(target: string): Promise<void> {
    await this.commit({ ...this.settings, targets: this.settings.targets.filter((x) => x !== target) });
    this.renderTargets();
  }

  private async loadSuggestions(): Promise<void> {
    const token = this.h.token();
    if (this.suggestions || !token) return;
    try {
      this.suggestions = await fetchSuggestions(token);
    } catch (e) {
      console.warn("suggestions", e);
      this.suggestions = { repos: [], orgs: [] };
    }
    this.renderTargets();
  }

  private renderTargets(): void {
    const watching = this.settings.targets;
    $("#targets-none").hidden = watching.length > 0;
    $("#targets").replaceChildren(
      ...watching.map((target) => {
        const li = document.createElement("li");
        li.className = "chip";
        const name = document.createElement("span");
        name.textContent = target === "@me" ? t("ob.s2.me") : target;
        const remove = document.createElement("button");
        remove.textContent = "×";
        remove.title = t("targets.remove", { target });
        remove.setAttribute("aria-label", remove.title);
        remove.addEventListener("click", () => void this.removeTarget(target));
        li.append(name, remove);
        return li;
      }),
    );
    // suggestions the user isn't watching yet, one click to add
    const pool = ["@me", ...(this.suggestions?.repos ?? []), ...(this.suggestions?.orgs ?? [])]
      .filter((x) => !watching.includes(x));
    $("#suggestions-block").hidden = pool.length === 0;
    $("#suggestions").replaceChildren(
      ...pool.map((target) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ob-chip";
        b.textContent = target === "@me" ? t("ob.s2.me") : target;
        b.addEventListener("click", () => void this.addTarget(target));
        return b;
      }),
    );
  }

  // ---- notifications: category toggle + sound in one row -----------------

  private bindNotify(): void {
    const enabled = $<HTMLInputElement>("#sounds-enabled");
    enabled.checked = this.settings.soundsEnabled;
    enabled.addEventListener("change", () =>
      void this.commit({ ...this.settings, soundsEnabled: enabled.checked }),
    );
    const volume = $<HTMLInputElement>("#volume");
    volume.value = String(Math.round(this.settings.volume * 100));
    // save on release, not on every pixel of drag
    volume.addEventListener("change", () =>
      void this.commit({ ...this.settings, volume: Number(volume.value) / 100 }),
    );
  }

  private renderNotifyRows(): void {
    $("#notify-rows").replaceChildren(
      ...ALL_CATEGORIES.map((cat) => {
        const on = this.settings.events[cat];
        const current = this.settings.sounds[cat];
        const custom = customPath(current);

        const row = document.createElement("div");
        row.className = "notify-row";
        row.dataset.off = String(!on);

        const name = document.createElement("span");
        name.textContent = categoryLabel(cat);

        const toggle = document.createElement("label");
        toggle.className = "toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = on;
        cb.setAttribute("aria-label", categoryLabel(cat));
        cb.addEventListener("change", async () => {
          await this.commit({ ...this.settings, events: { ...this.settings.events, [cat]: cb.checked } });
          row.dataset.off = String(!cb.checked);
        });
        toggle.append(cb);

        const select = document.createElement("select");
        const opts: [SoundRef | "custom", string][] = [
          ["none", t("sounds.none")],
          ...(Object.keys(BUILTIN_SOUNDS) as BuiltinSoundId[]).map((id) => [id, builtinLabel(id)] as [SoundRef, string]),
          ["custom", custom ? t("sounds.file", { name: custom.split("/").pop() ?? "" }) : t("sounds.pick")],
        ];
        for (const [value, label] of opts) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = label;
          select.append(o);
        }
        select.value = custom ? "custom" : current;
        select.setAttribute("aria-label", `${t("notify.col.sound")}: ${categoryLabel(cat)}`);
        select.addEventListener("change", async () => {
          if (select.value !== "custom") {
            await this.setSound(cat, select.value as SoundRef);
            return;
          }
          const picked = await pickFile({
            multiple: false,
            directory: false,
            title: t("sounds.pickTitle", { category: categoryLabel(cat) }),
            filters: [{ name: "Audio", extensions: ["ogg", "wav", "mp3", "flac", "opus"] }],
          });
          if (typeof picked === "string") {
            try {
              // Rust copies it into the app data dir, the only path the
              // asset protocol is allowed to serve
              const stored = await invoke<string>("import_sound", { path: picked });
              await this.setSound(cat, `file:${stored}`);
            } catch (e) {
              alert(t("sounds.importFailed", { error: String(e) }));
              select.value = custom ? "custom" : current;
            }
          } else {
            select.value = custom ? "custom" : current; // dialog cancelled
          }
        });

        const play = document.createElement("button");
        play.type = "button";
        play.className = "ghost icon";
        play.title = t("sounds.play");
        play.setAttribute("aria-label", `${t("sounds.play")}: ${categoryLabel(cat)}`);
        play.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5v9l8-4.5z" fill="currentColor"/></svg>';
        play.addEventListener("click", () => void playSound(this.settings.sounds[cat], this.settings.volume));

        row.append(name, toggle, select, play);
        return row;
      }),
    );
  }

  private async setSound(cat: EventCategory, ref: SoundRef): Promise<void> {
    await this.commit({ ...this.settings, sounds: { ...this.settings.sounds, [cat]: ref } });
    this.renderNotifyRows();
    void playSound(ref, this.settings.volume);
  }

  // ---- options -----------------------------------------------------------

  private bindOptions(): void {
    const interval = $<HTMLInputElement>("#interval");
    interval.value = String(this.settings.pollSeconds);
    interval.addEventListener("change", () => {
      const v = Math.max(60, Number(interval.value) || 60);
      interval.value = String(v);
      void this.commit({ ...this.settings, pollSeconds: v });
    });

    const agentsOwn = $<HTMLInputElement>("#agents-own");
    agentsOwn.checked = this.settings.agentsOwn;
    agentsOwn.addEventListener("change", () => void this.commit({ ...this.settings, agentsOwn: agentsOwn.checked }));

    const ignoreOwn = $<HTMLInputElement>("#ignore-own");
    ignoreOwn.checked = this.settings.ignoreOwn;
    ignoreOwn.addEventListener("change", () => void this.commit({ ...this.settings, ignoreOwn: ignoreOwn.checked }));

    $<HTMLInputElement>("#autostart").addEventListener("change", async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      try {
        on ? await enable() : await disable();
      } catch (err) {
        console.error("autostart", err);
      }
      await this.syncAutostart();
    });

    const glass = $<HTMLInputElement>("#glass");
    const glassValue = $<HTMLOutputElement>("#glass-value");
    const showGlass = (v: number) => { glassValue.value = `${v}%`; };
    glass.value = String(Math.round(this.settings.glass * 100));
    showGlass(Number(glass.value));
    applyGlass(this.settings.glass);
    // live while dragging, persist on release
    glass.addEventListener("input", () => { applyGlass(Number(glass.value) / 100); showGlass(Number(glass.value)); });
    glass.addEventListener("change", () => void this.commit({ ...this.settings, glass: Number(glass.value) / 100 }));

    const language = $<HTMLSelectElement>("#language");
    language.value = this.settings.language;
    language.addEventListener("change", async () => {
      const next = language.value as LangSetting;
      await this.commit({ ...this.settings, language: next });
      const lang = initLang(next, navigator.language);
      // Rust owns the tray menu labels; keep it in sync
      invoke("set_language", { lang }).catch((e) => console.warn("set_language", e));
      applyStatic();
      this.renderAll();
    });

    $("#test-toast").addEventListener("click", async () => {
      ringTray();
      this.ringMascot();
      await toast(t("test.title"), t("test.body"), "https://github.com");
      if (this.settings.soundsEnabled) await playSound(this.settings.sounds.push, this.settings.volume);
    });
  }

  private async syncAutostart(): Promise<void> {
    try {
      $<HTMLInputElement>("#autostart").checked = await isEnabled();
    } catch {
      /* not supported in this env, leave unchecked */
    }
  }

  // ---- status + activity -------------------------------------------------

  setStatus(s: PollStatus): void {
    this.lastStatus = s;
    const el = $("#status");
    el.dataset.kind = s.kind;
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.textContent =
      s.kind === "idle" ? t("status.idle") :
      s.kind === "polling" ? t("status.polling") :
      s.kind === "ok" ? t("status.ok", { time: fmt(s.at) }) + (s.remaining !== null ? t("status.remaining", { n: s.remaining }) : "") :
      s.kind === "paused" ? t("status.paused", { reason: s.reason, time: fmt(s.until) }) :
      t("status.error", { message: s.message });
  }

  /** Play the header sprite once (~1.4 s), matching the tray animation. */
  ringMascot(): void {
    const m = $("#mascot");
    m.classList.remove("ringing");
    void m.offsetWidth; // reflow so re-adding the class restarts the animation
    m.classList.add("ringing");
  }

  pushNotices(notices: Notice[]): void {
    this.ringMascot();
    this.recent = [...notices].reverse().concat(this.recent).slice(0, 40); // newest on top
    this.renderRecent();
  }

  getRecent(): Notice[] {
    return this.recent;
  }

  currentSettings(): Settings {
    return this.settings;
  }

  /** Called when onboarding changed settings/token behind our back. */
  refresh(settings: Settings, hasToken: boolean): void {
    this.settings = settings;
    this.hasToken = hasToken;
    this.suggestions = null;
    applyStatic();
    this.renderAll();
    this.setView("activity");
  }

  private renderRecent(): void {
    const list = $("#recent");
    $("#recent-empty").hidden = this.recent.length > 0;
    list.replaceChildren(
      ...this.recent.map((n) => {
        const li = document.createElement("li");
        li.className = "notice";
        li.dataset.category = n.category;
        const when = new Date(n.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        li.innerHTML = `
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="28" height="28" loading="lazy">
          <div>
            <a href="#" class="notice-title"></a>
            <p class="notice-body"></p>
            <time>${when}</time>
          </div>`;
        const img = li.querySelector<HTMLImageElement>("img")!;
        if (n.avatar) img.src = `${n.avatar}&s=64`;
        else img.replaceWith(Object.assign(document.createElement("span"), { className: "notice-dot" }));
        const a = li.querySelector<HTMLAnchorElement>(".notice-title")!;
        a.textContent = n.title;
        if (n.agent) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = n.agent;
          a.after(" ", tag);
        }
        if (n.url) {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            void openUrl(n.url);
          });
        } else {
          a.removeAttribute("href");
        }
        li.querySelector(".notice-body")!.textContent = n.body;
        return li;
      }),
    );
  }

  // ---- internals ---------------------------------------------------------

  private async commit(next: Settings): Promise<void> {
    this.settings = next;
    await this.h.onSettingsChange(next);
  }
}
