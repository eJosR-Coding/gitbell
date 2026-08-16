// DOM glue. No framework: the page is small enough that querySelector + a
// few render functions beat pulling in React for a settings screen.

import { openUrl } from "@tauri-apps/plugin-opener";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { setToken } from "../platform/secrets";
import { isValidTarget, whoAmI } from "../core/github";
import { ringTray, toast } from "../platform/notify";
import { BUILTIN_SOUNDS, customPath, playSound, type SoundRef } from "../platform/sounds";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  type EventCategory,
  type Notice,
  type PollStatus,
  type Settings,
} from "../core/types";

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

export interface UiHandlers {
  onSettingsChange(next: Settings): Promise<void>;
  onTokenChange(token: string): Promise<void>;
  onPollNow(): void;
}

export class Ui {
  private settings: Settings;
  private recent: Notice[] = [];

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
    this.renderEventToggles();
    this.bindToken();
    this.bindTargets();
    this.bindOptions();
    this.bindSounds();
    this.renderSoundRows();
    this.renderTargets();
    this.renderRecent();
    $("#poll-now").addEventListener("click", () => this.h.onPollNow());
    void this.syncAutostart();
  }

  // ---- token -------------------------------------------------------------

  private bindToken(): void {
    const input = $<HTMLInputElement>("#token");
    const status = $("#token-status");
    // never echo the stored token back into the DOM; a placeholder is enough
    if (this.hasToken) input.placeholder = "•••••••• (guardado en el llavero del sistema)";
    if (this.settings.login) status.textContent = `Conectado como @${this.settings.login}`;

    $("#token-save").addEventListener("click", async () => {
      const token = input.value.trim();
      if (!token) {
        status.textContent = "Pega un token primero";
        return;
      }
      status.textContent = "Verificando…";
      try {
        const login = await whoAmI(token);
        await setToken(token);
        await this.h.onTokenChange(token);
        this.hasToken = true;
        input.value = "";
        input.placeholder = "•••••••• (guardado en el llavero del sistema)";
        status.textContent = `Conectado como @${login}`;
        await this.commit({ ...this.settings, login });
      } catch (e) {
        status.textContent = `Token inválido: ${e instanceof Error ? e.message : e}`;
      }
    });
  }

  // ---- targets -----------------------------------------------------------

  private bindTargets(): void {
    const input = $<HTMLInputElement>("#target-input");
    const add = async () => {
      const t = input.value.trim();
      if (!isValidTarget(t)) {
        input.setCustomValidity("Usa owner/repo, org:nombre o @me");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      if (!this.settings.targets.includes(t)) {
        await this.commit({ ...this.settings, targets: [...this.settings.targets, t] });
        this.renderTargets();
      }
      input.value = "";
    };
    $("#target-add").addEventListener("click", () => void add());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void add();
    });
  }

  private renderTargets(): void {
    const list = $("#targets");
    list.replaceChildren(
      ...this.settings.targets.map((t) => {
        const li = document.createElement("li");
        li.className = "chip";
        li.innerHTML = `<span>${t}</span><button aria-label="Quitar ${t}" title="Quitar">×</button>`;
        li.querySelector("button")!.addEventListener("click", async () => {
          await this.commit({
            ...this.settings,
            targets: this.settings.targets.filter((x) => x !== t),
          });
          this.renderTargets();
        });
        return li;
      }),
    );
  }

  // ---- event categories --------------------------------------------------

  private renderEventToggles(): void {
    const grid = $("#events");
    grid.replaceChildren(
      ...ALL_CATEGORIES.map((cat) => {
        const label = document.createElement("label");
        label.className = "toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = this.settings.events[cat];
        cb.addEventListener("change", () =>
          void this.commit({
            ...this.settings,
            events: { ...this.settings.events, [cat]: cb.checked },
          }),
        );
        label.append(cb, document.createTextNode(CATEGORY_LABELS[cat]));
        return label;
      }),
    );
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

    const ignoreOwn = $<HTMLInputElement>("#ignore-own");
    ignoreOwn.checked = this.settings.ignoreOwn;
    ignoreOwn.addEventListener("change", () =>
      void this.commit({ ...this.settings, ignoreOwn: ignoreOwn.checked }),
    );

    $<HTMLInputElement>("#autostart").addEventListener("change", async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      try {
        on ? await enable() : await disable();
      } catch (err) {
        console.error("autostart", err);
      }
      await this.syncAutostart();
    });

    $("#test-toast").addEventListener("click", async () => {
      ringTray();
      this.ringMascot();
      await toast("GitBell funciona", "Así se van a ver los avisos. Click para abrir GitHub.", "https://github.com");
      if (this.settings.soundsEnabled) {
        await playSound(this.settings.sounds.push, this.settings.volume);
      }
    });
  }

  // ---- sounds ------------------------------------------------------------

  private bindSounds(): void {
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

  /** One row per category: <select> of sounds + preview + custom file picker. */
  private renderSoundRows(): void {
    const list = $("#sound-rows");
    list.replaceChildren(
      ...ALL_CATEGORIES.map((cat) => {
        const current = this.settings.sounds[cat];
        const custom = customPath(current);

        const row = document.createElement("div");
        row.className = "sound-row";

        const name = document.createElement("span");
        name.textContent = CATEGORY_LABELS[cat];

        const select = document.createElement("select");
        const opts: [SoundRef | "custom", string][] = [
          ["none", "Sin sonido"],
          ...(Object.entries(BUILTIN_SOUNDS) as [SoundRef, { label: string }][]).map(
            ([id, s]) => [id, s.label] as [SoundRef, string],
          ),
          ["custom", custom ? `Archivo: ${custom.split("/").pop()}` : "Archivo propio…"],
        ];
        for (const [value, label] of opts) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = label;
          select.append(o);
        }
        select.value = custom ? "custom" : current;
        select.addEventListener("change", async () => {
          if (select.value !== "custom") {
            await this.setSound(cat, select.value as SoundRef);
            return;
          }
          const picked = await pickFile({
            multiple: false,
            directory: false,
            title: `Sonido para ${CATEGORY_LABELS[cat]}`,
            filters: [{ name: "Audio", extensions: ["ogg", "wav", "mp3", "flac", "opus"] }],
          });
          if (typeof picked === "string") {
            try {
              // Rust copies it into the app data dir, the only path the
              // asset protocol is allowed to serve
              const stored = await invoke<string>("import_sound", { path: picked });
              await this.setSound(cat, `file:${stored}`);
            } catch (e) {
              alert(`No se pudo importar el sonido: ${e}`);
              select.value = custom ? "custom" : current;
            }
          } else {
            // user cancelled the dialog, snap the select back
            select.value = custom ? "custom" : current;
          }
        });

        const play = document.createElement("button");
        play.className = "ghost icon";
        play.title = "Escuchar";
        play.textContent = "▶";
        play.addEventListener("click", () =>
          void playSound(this.settings.sounds[cat], this.settings.volume),
        );

        row.append(name, select, play);
        return row;
      }),
    );
  }

  private async setSound(cat: EventCategory, ref: SoundRef): Promise<void> {
    await this.commit({ ...this.settings, sounds: { ...this.settings.sounds, [cat]: ref } });
    this.renderSoundRows();
    void playSound(ref, this.settings.volume);
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
    const el = $("#status");
    el.dataset.kind = s.kind;
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.textContent =
      s.kind === "idle" ? "En espera" :
      s.kind === "polling" ? "Revisando…" :
      s.kind === "ok" ? `Última revisión ${fmt(s.at)}${s.remaining !== null ? ` · ${s.remaining} req restantes` : ""}` :
      s.kind === "paused" ? `${s.reason}, reintento a las ${fmt(s.until)}` :
      `Error: ${s.message}`;
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
    // newest on top
    this.recent = [...notices].reverse().concat(this.recent).slice(0, 40);
    this.renderRecent();
  }

  getRecent(): Notice[] {
    return this.recent;
  }

  private renderRecent(): void {
    const list = $("#recent");
    const empty = $("#recent-empty");
    empty.hidden = this.recent.length > 0;
    list.replaceChildren(
      ...this.recent.map((n) => {
        const li = document.createElement("li");
        li.className = "notice";
        li.dataset.category = n.category;
        const when = new Date(n.at).toLocaleString([], {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        li.innerHTML = `
          <img src="${n.avatar}&s=64" alt="" width="28" height="28" loading="lazy">
          <div>
            <a href="#" class="notice-title"></a>
            <p class="notice-body"></p>
            <time>${when}</time>
          </div>`;
        const a = li.querySelector<HTMLAnchorElement>(".notice-title")!;
        a.textContent = n.title;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          void openUrl(n.url);
        });
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
