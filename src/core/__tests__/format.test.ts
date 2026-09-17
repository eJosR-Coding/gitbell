import { beforeAll, describe, expect, it } from "vitest";
import { toNotice } from "../format";
import { initLang } from "../i18n";
import type { GhEvent } from "../types";

const base = (type: string, payload: Record<string, unknown>): GhEvent => ({
  id: "1",
  type,
  actor: { login: "ana", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
  repo: { name: "acme/api" },
  payload,
  created_at: "2026-09-12T10:00:00Z",
});

describe("toNotice", () => {
  beforeAll(() => initLang("es", undefined));

  it("narrates a push with commit count and first message", () => {
    const n = toNotice(
      base("PushEvent", {
        ref: "refs/heads/main",
        size: 2,
        before: "aaa",
        head: "bbb",
        commits: [{ message: "fix: login\n\nmore" }],
      }),
    )!;
    expect(n.category).toBe("push");
    expect(n.title).toBe("ana hizo push a acme/api");
    expect(n.body).toBe("2 commits en main: fix: login");
    expect(n.url).toBe("https://github.com/acme/api/compare/aaa...bbb");
  });

  it("doesn't claim '0 commits' when GitHub omits the count", () => {
    const n = toNotice(base("PushEvent", { ref: "refs/heads/main", before: "a", head: "b" }))!;
    expect(n.body).toBe("en main");
  });

  it("distinguishes merged from closed PRs", () => {
    const pr = { number: 7, title: "Add cache", html_url: "https://github.com/acme/api/pull/7" };
    expect(toNotice(base("PullRequestEvent", { action: "closed", number: 7, pull_request: { ...pr, merged: true } }))!.title)
      .toBe("ana mergeó PR #7 en acme/api");
    expect(toNotice(base("PullRequestEvent", { action: "closed", number: 7, pull_request: { ...pr, merged: false } }))!.title)
      .toBe("ana cerró PR #7 en acme/api");
  });

  it("tells PR comments from issue comments", () => {
    const comment = { body: "nice", html_url: "https://github.com/acme/api/issues/3#c1" };
    expect(toNotice(base("IssueCommentEvent", { issue: { number: 3, pull_request: {} }, comment }))!.title)
      .toContain("PR #3");
    expect(toNotice(base("IssueCommentEvent", { issue: { number: 3 }, comment }))!.title)
      .toContain("issue #3");
  });

  it("ignores event types it doesn't narrate", () => {
    expect(toNotice(base("GollumEvent", {}))).toBeNull();
  });

  it("switches language", () => {
    initLang("en", undefined);
    expect(toNotice(base("WatchEvent", { action: "started" }))!.title).toBe("ana starred acme/api");
    initLang("es", undefined);
  });
});
