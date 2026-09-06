// The heartbeat. One loop, every `pollSeconds`, hits every target, diffs
// against the last id we saw, and fires toasts for what's new.
//
// Dedupe strategy: event ids are monotonically increasing numeric strings.
// We remember the newest id per target. First time we see a target we only
// record its newest id and notify nothing, otherwise a fresh install would
// spam you with the last 90 days of activity.

import { endpointFor, fetchEvents, GhError } from "./github";
import { t } from "./i18n";
import { toNotice } from "./format";
import { markUnread, ringTray, toast } from "../platform/notify";
import { playSound } from "../platform/sounds";
import { loadLastSeen, saveLastSeen } from "../platform/settings";
import type { Notice, PollStatus, Settings } from "./types";

/** Max toasts per poll cycle. Beyond that we send one summary toast. */
const MAX_TOASTS_PER_CYCLE = 5;

export interface PollerCallbacks {
  onStatus(status: PollStatus): void;
  onNotices(notices: Notice[]): void;
}

export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private etags = new Map<string, string>();
  private lastSeen: Record<string, string> = {};
  private serverInterval = 60;
  private pausedUntil = 0;
  private running = false;
  private settings: Settings;
  private token: string | null;

  constructor(settings: Settings, token: string | null, private cb: PollerCallbacks) {
    this.settings = settings;
    this.token = token;
  }

  async start(): Promise<void> {
    this.lastSeen = await loadLastSeen();
    this.schedule(0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Hot-swap settings without restarting the loop. */
  update(settings: Settings): void {
    const targetsChanged = settings.targets.join() !== this.settings.targets.join();
    this.settings = settings;
    if (targetsChanged) {
      // new target list: drop cached etags, re-poll soon
      this.etags.clear();
      this.schedule(0);
    }
  }

  /** New token (or none). ETags are per-token on GitHub's side, so reset. */
  setToken(token: string | null): void {
    this.token = token;
    this.etags.clear();
    this.schedule(0);
  }

  /** Manual trigger (tray menu "Revisar ahora"). */
  pollNow(): void {
    this.schedule(0);
  }

  private schedule(delayMs: number): void {
    this.stop();
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private nextDelayMs(): number {
    // respect whichever is stricter: user's choice or what GitHub asked for
    return Math.max(this.settings.pollSeconds, this.serverInterval) * 1000;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.pollAll();
    } finally {
      this.running = false;
      const wait = Math.max(this.nextDelayMs(), this.pausedUntil - Date.now());
      this.schedule(wait);
    }
  }

  private async pollAll(): Promise<void> {
    const { login, targets } = this.settings;
    const token = this.token;
    if (!token) {
      this.cb.onStatus({ kind: "error", message: t("poller.noToken") });
      return;
    }
    if (Date.now() < this.pausedUntil) return;

    this.cb.onStatus({ kind: "polling" });
    const fresh: Notice[] = [];
    let remaining: number | null = null;

    for (const target of targets) {
      const url = endpointFor(target, login);
      if (!url) continue;
      try {
        const r = await fetchEvents(url, token, this.etags.get(target) ?? null);
        if (r.etag) this.etags.set(target, r.etag);
        if (r.pollInterval) this.serverInterval = r.pollInterval;
        if (r.remaining !== null) remaining = r.remaining;
        if (!r.events) continue; // 304, nothing new

        fresh.push(...this.diff(target, r.events));
      } catch (e) {
        if (e instanceof GhError && e.isRateLimited && e.resetAt) {
          this.pausedUntil = e.resetAt * 1000 + 1000;
          this.cb.onStatus({
            kind: "paused",
            until: new Date(this.pausedUntil),
            reason: t("poller.rateLimit"),
          });
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        this.cb.onStatus({ kind: "error", message: `${target}: ${msg}` });
        // keep going with the other targets, one bad repo shouldn't kill the loop
      }
    }

    await saveLastSeen(this.lastSeen);

    if (fresh.length) {
      // events across targets can overlap (same repo via org: and owner/repo), dedupe by id
      const unique = [...new Map(fresh.map((n) => [n.id, n])).values()];
      unique.sort((a, b) => a.at.localeCompare(b.at));
      await this.fire(unique);
      this.cb.onNotices(unique);
    }
    this.cb.onStatus({ kind: "ok", at: new Date(), remaining });
  }

  /** Returns notices for events newer than what we've seen for this target. */
  private diff(target: string, events: import("./types").GhEvent[]): Notice[] {
    if (events.length === 0) return [];
    const newest = events[0].id; // API returns newest first
    const last = this.lastSeen[target];
    this.lastSeen[target] = newest;

    if (!last) return []; // first contact: just remember, don't spam

    const { events: wanted, ignoreOwn, login } = this.settings;
    const out: Notice[] = [];
    for (const ev of events) {
      if (BigInt(ev.id) <= BigInt(last)) break;
      if (ignoreOwn && login && ev.actor.login === login) continue;
      const n = toNotice(ev);
      if (!n || !wanted[n.category]) continue;
      out.push(n);
    }
    return out;
  }

  private async fire(notices: Notice[]): Promise<void> {
    const { soundsEnabled, sounds, volume } = this.settings;
    ringTray();
    markUnread(notices.length);
    const head = notices.slice(0, MAX_TOASTS_PER_CYCLE);
    for (const n of head) {
      await toast(n.title, n.body, n.url);
      // await so back-to-back toasts don't stack their chimes into mush
      if (soundsEnabled) await playSound(sounds[n.category], volume);
    }
    const rest = notices.length - head.length;
    if (rest > 0) {
      await toast("GitBell", t(rest === 1 ? "poller.more" : "poller.morePlural", { n: rest }));
    }
  }
}
