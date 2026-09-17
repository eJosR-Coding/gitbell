// Thin client for the GitHub Events API. Handles the three things that
// matter for polling politely: ETags (304 = free request), X-Poll-Interval
// (server tells us how often we may ask) and rate-limit headers.

import type { GhEvent } from "./types";

const API = "https://api.github.com";

/** A request that never answers must not freeze the poll loop. */
const TIMEOUT_MS = 20_000;

async function timedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a user-facing target string into the endpoint we hit. */
export function endpointFor(target: string, login: string | null): string | null {
  if (target === "@me") {
    // events from repos you watch + people you follow. needs a resolved login.
    return login ? `${API}/users/${login}/received_events` : null;
  }
  if (target.startsWith("org:")) {
    return `${API}/orgs/${target.slice(4)}/events`;
  }
  if (target.includes("/")) {
    return `${API}/repos/${target}/events`;
  }
  return null;
}

export function isValidTarget(t: string): boolean {
  if (t === "@me") return true;
  if (/^org:[\w.-]+$/.test(t)) return true;
  return /^[\w.-]+\/[\w.-]+$/.test(t);
}

export interface FetchResult {
  /** null when 304 (nothing new) */
  events: GhEvent[] | null;
  etag: string | null;
  /** seconds GitHub asks us to wait before polling again */
  pollInterval: number | null;
  remaining: number | null;
  /** unix seconds when the rate limit resets, only meaningful when we got throttled */
  resetAt: number | null;
  status: number;
}

function headers(token: string, etag?: string | null): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (etag) h["If-None-Match"] = etag;
  return h;
}

export async function fetchEvents(
  url: string,
  token: string,
  etag: string | null,
): Promise<FetchResult> {
  const res = await timedFetch(url, { headers: headers(token, etag) });
  const num = (k: string) => {
    const v = res.headers.get(k);
    return v === null ? null : Number(v);
  };
  const base = {
    etag: res.headers.get("etag"),
    pollInterval: num("x-poll-interval"),
    remaining: num("x-ratelimit-remaining"),
    resetAt: num("x-ratelimit-reset"),
    status: res.status,
  };

  if (res.status === 304) return { ...base, events: null };
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new GhError(res.status, msg, base.resetAt, base.remaining);
  }
  const events = (await res.json()) as GhEvent[];
  return { ...base, events };
}

export interface Profile {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Validate a token by asking who it belongs to. */
export async function whoAmI(token: string): Promise<Profile> {
  const res = await timedFetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text().catch(() => ""), null, null);
  const data = (await res.json()) as { login: string; name: string | null; avatar_url: string | null };
  return { login: data.login, name: data.name ?? null, avatarUrl: data.avatar_url ?? null };
}

export class GhError extends Error {
  constructor(
    public status: number,
    body: string,
    public resetAt: number | null,
    public remaining: number | null,
  ) {
    super(`GitHub ${status}: ${body.slice(0, 200)}`);
  }

  get isRateLimited(): boolean {
    return (this.status === 403 || this.status === 429) && this.remaining === 0;
  }
}

export interface Suggestions {
  /** "owner/repo", most recently pushed first */
  repos: string[];
  /** "org:name" */
  orgs: string[];
}

/** Smart defaults for onboarding: the user's busiest repos and their orgs. */
export async function fetchSuggestions(token: string): Promise<Suggestions> {
  const get = async (path: string) => {
    const res = await timedFetch(`${API}${path}`, { headers: headers(token) });
    if (!res.ok) throw new GhError(res.status, await res.text().catch(() => ""), null, null);
    return res.json();
  };
  const [repos, orgs] = await Promise.all([
    get("/user/repos?sort=pushed&per_page=8&affiliation=owner,collaborator,organization_member") as Promise<{ full_name: string }[]>,
    get("/user/orgs?per_page=10") as Promise<{ login: string }[]>,
  ]);
  return {
    repos: repos.map((r) => r.full_name),
    orgs: orgs.map((o) => `org:${o.login}`),
  };
}

/** The newest event of a target, already as a raw event. Null when quiet. */
export async function fetchLatestEvent(target: string, token: string, login: string | null): Promise<GhEvent | null> {
  const url = endpointFor(target, login);
  if (!url) return null;
  const r = await fetchEvents(`${url}?per_page=10`, token, null);
  return r.events?.[0] ?? null;
}

/**
 * GitHub's Events API stopped including `size` and `commits` in PushEvent
 * payloads (only before/head/ref remain). One compare call restores the
 * commit count, messages and authors, which the formatter and the agent
 * detector need. Mutates the event in place; failures leave it slim.
 */
export async function enrichPushEvent(ev: GhEvent, token: string): Promise<void> {
  const p = ev.payload;
  if (ev.type !== "PushEvent" || Array.isArray(p.commits) && p.commits.length) return;
  if (!p.before || !p.head) return;
  try {
    const res = await timedFetch(`${API}/repos/${ev.repo.name}/compare/${p.before}...${p.head}?per_page=20`, {
      headers: headers(token),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      total_commits: number;
      commits: { sha: string; commit: { message: string; author: { name: string; email: string } } }[];
    };
    p.size = data.total_commits;
    p.commits = data.commits.map((c) => ({ sha: c.sha, message: c.commit.message, author: c.commit.author }));
  } catch (e) {
    console.warn("enrich push", ev.id, e);
  }
}
