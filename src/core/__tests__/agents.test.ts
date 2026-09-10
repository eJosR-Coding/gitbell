import { beforeAll, describe, expect, it } from "vitest";
import { detectAgent } from "../agents";
import { toNotice } from "../format";
import { initLang } from "../i18n";
import type { GhEvent } from "../types";

const ev = (type: string, payload: Record<string, unknown>, actor = "ejos"): GhEvent => ({
  id: "9",
  type,
  actor: { login: actor, avatar_url: "" },
  repo: { name: "acme/api" },
  payload,
  created_at: "2026-09-12T10:00:00Z",
});
const push = (message: string, author = { name: "Ana", email: "ana@example.com" }, ref = "refs/heads/main") =>
  ev("PushEvent", { ref, size: 1, commits: [{ message, author }] });

describe("detectAgent", () => {
  it("claude code trailers, with session url when present", () => {
    const h = detectAgent(push("fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01A"));
    expect(h?.agent).toBe("claude");
    expect(h?.sessionUrl).toBe("https://claude.ai/code/session_01A");
    expect(detectAgent(push("fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"))?.sessionUrl).toBeNull();
  });

  it("copilot: author name, committer bot login, Agent-Logs-Url", () => {
    expect(detectAgent(push("x", { name: "Copilot", email: "1+copilot@users.noreply.github.com" }))?.agent).toBe("copilot");
    expect(detectAgent(push("x\n\nAgent-Logs-Url: https://github.com/acme/api/sessions/abc"))?.sessionUrl)
      .toBe("https://github.com/acme/api/sessions/abc");
    expect(detectAgent(ev("PullRequestEvent", { pull_request: { head: { ref: "main" } } }, "copilot-swe-agent[bot]"))?.agent).toBe("copilot");
  });

  it("codex, cursor, opencode trailers", () => {
    expect(detectAgent(push("x\n\nCo-authored-by: Codex <noreply@openai.com>"))?.agent).toBe("codex");
    expect(detectAgent(push("x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>"))?.agent).toBe("cursor");
    expect(detectAgent(push("x\n\n🤖 Generated with opencode\nCo-Authored-By: opencode <noreply@opencode.ai>"))?.agent).toBe("opencode");
  });

  it("branch prefixes and PR body markers", () => {
    expect(detectAgent(ev("PullRequestEvent", { action: "opened", pull_request: { head: { ref: "claude/fix-login-abc" }, body: "" } }))?.agent).toBe("claude");
    expect(detectAgent(ev("PullRequestEvent", { action: "opened", pull_request: { head: { ref: "feat/x" }, body: "…\n\n🤖 Generated with [Claude Code](https://claude.com)" } }))?.agent).toBe("claude");
    expect(detectAgent(ev("CreateEvent", { ref_type: "branch", ref: "copilot/add-tests" }))?.agent).toBe("copilot");
  });

  it("humans stay humans", () => {
    expect(detectAgent(push("feat: real work by a person"))).toBeNull();
    expect(detectAgent(ev("PullRequestEvent", { pull_request: { head: { ref: "feature/login" }, body: "manual" } }))).toBeNull();
  });

  it("unknown [bot] actors are flagged as generic bots", () => {
    expect(detectAgent(push("x"))).toBeNull();
    expect(detectAgent(ev("WatchEvent", {}, "dependabot[bot]"))?.agent).toBe("bot");
  });
});

describe("toNotice with agents", () => {
  beforeAll(() => initLang("es", undefined));
  const e = push("feat: x\n\nClaude-Session: https://claude.ai/code/session_01A");

  it("moves the event to the agent category, names the agent, links the session", () => {
    const n = toNotice(e)!;
    expect(n.category).toBe("agent");
    expect(n.agent).toBe("Claude Code");
    expect(n.title).toBe("🤖 Claude Code (@ejos) hizo push a acme/api");
    expect(n.url).toBe("https://claude.ai/code/session_01A");
  });

  it("falls back to the plain category when agents are disabled", () => {
    const n = toNotice(e, false)!;
    expect(n.category).toBe("push");
    expect(n.agent).toBeUndefined();
    expect(n.title).toBe("ejos hizo push a acme/api");
  });
});
