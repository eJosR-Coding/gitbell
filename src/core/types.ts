// Shared shapes. Kept in one file so the rest of the code reads clean.

import type { SoundRef } from "../platform/sounds";
import { t, type Key, type LangSetting } from "./i18n";

/** Buckets the user can toggle. Each GitHub event type maps into one of these. */
export type EventCategory =
  | "push"
  | "pr"
  | "review"
  | "issue"
  | "comment"
  | "branch"
  | "release"
  | "social"
  | "external";

export const ALL_CATEGORIES: EventCategory[] = [
  "push",
  "pr",
  "review",
  "issue",
  "comment",
  "branch",
  "release",
  "social",
  "external",
];

export function categoryLabel(cat: EventCategory): string {
  return t(`cat.${cat}` as Key);
}

export interface Settings {
  /** "auto" follows the OS locale */
  language: LangSetting;
  /** first-run flow completed or skipped */
  onboarded: boolean;
  /** login resolved from the token, null until verified */
  login: string | null;
  /** display name and avatar from /user, for the identity strip */
  name: string | null;
  avatarUrl: string | null;
  /** "owner/repo", "org:name" or "@me" */
  targets: string[];
  events: Record<EventCategory, boolean>;
  /** seconds between polls, GitHub floor is 60 */
  pollSeconds: number;
  /** skip events where actor === login (you already know what you did) */
  ignoreOwn: boolean;
  /** master switch for audio */
  soundsEnabled: boolean;
  /** 0..1 */
  volume: number;
  /** window tint opacity, 0.3..1. 1 = opaque, no glass */
  glass: number;
  /** which sound each category plays */
  sounds: Record<EventCategory, SoundRef>;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  onboarded: false,
  login: null,
  name: null,
  avatarUrl: null,
  targets: ["@me"],
  events: {
    push: true,
    pr: true,
    review: true,
    issue: true,
    comment: false,
    branch: false,
    release: true,
    social: false,
    external: true,
  },
  pollSeconds: 60,
  ignoreOwn: true,
  soundsEnabled: true,
  volume: 0.8,
  glass: 0.7,
  sounds: {
    push: "sound1",
    pr: "sound2",
    review: "sound2",
    issue: "sound1",
    comment: "sound1",
    branch: "sound1",
    release: "sound2",
    social: "none",
    external: "sound1",
  },
};

/** Raw event as GitHub's Events API returns it. Only the bits we read. */
export interface GhEvent {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  // payload shape depends on `type`, we narrow it inside format.ts
  payload: Record<string, any>;
  created_at: string;
}

/** What we actually show: OS toast + row in the activity list. */
export interface Notice {
  id: string;
  category: EventCategory;
  title: string;
  body: string;
  url: string;
  actor: string;
  avatar: string;
  repo: string;
  at: string;
}

export type PollStatus =
  | { kind: "idle" }
  | { kind: "polling" }
  | { kind: "ok"; at: Date; remaining: number | null }
  | { kind: "paused"; until: Date; reason: string }
  | { kind: "error"; message: string };
