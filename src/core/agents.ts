// Who did this: a human or a coding agent? GitHub has no "agent" flag, so
// we read the fingerprints each tool leaves behind. All of them are
// optional and users can turn them off, so a hit is "probable", never
// "certain". Sources for each signal are in APUNTES.md / README.

import type { GhEvent } from "./types";

export type AgentId =
  | "claude"    // Claude Code (CLI, web, GitHub Action)
  | "copilot"   // GitHub Copilot coding agent
  | "codex"     // OpenAI Codex
  | "cursor"    // Cursor agent
  | "opencode"  // OpenCode
  | "devin"     // Cognition Devin
  | "jules"     // Google Jules
  | "aider"     // Aider
  | "bot";      // some other [bot] account

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: "Claude Code",
  copilot: "Copilot",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  devin: "Devin",
  jules: "Jules",
  aider: "Aider",
  bot: "Bot",
};

export interface AgentHit {
  agent: AgentId;
  /** link to the agent's own session/logs when the commit carried one */
  sessionUrl: string | null;
  /** which fingerprint fired, for debugging and tests */
  signal: string;
}

// ---- fingerprints -----------------------------------------------------------

/** GitHub logins that are agents. Matched case-insensitively, exact. */
const LOGINS: [string, AgentId][] = [
  ["claude[bot]", "claude"],
  ["copilot-swe-agent[bot]", "copilot"],
  ["copilot", "copilot"],
  ["chatgpt-codex-connector[bot]", "codex"],
  ["cursor[bot]", "cursor"],
  ["devin-ai-integration[bot]", "devin"],
  ["google-labs-jules[bot]", "jules"],
];

/** Email domains/addresses that show up in Co-Authored-By trailers or as commit authors. */
const EMAILS: [RegExp, AgentId][] = [
  [/@anthropic\.com$/i, "claude"],
  [/^noreply@openai\.com$/i, "codex"],
  [/@cursor\.com$/i, "cursor"],
  [/@opencode\.ai$/i, "opencode"],
];

/** Branch prefixes the cloud agents use for their work. */
const BRANCHES: [RegExp, AgentId][] = [
  [/^claude\//, "claude"],
  [/^copilot\//, "copilot"],
  [/^cursor\//, "cursor"],
  [/^codex\//, "codex"],
  [/^devin\//, "devin"],
];

/** Free-text markers in commit messages or PR bodies. */
const TEXT: [RegExp, AgentId][] = [
  [/Generated with \[?Claude Code\]?/i, "claude"],
  [/^Claude-Session:\s*https?:\/\/\S+/im, "claude"],
  [/^Agent-Logs-Url:\s*https?:\/\/\S+/im, "copilot"],
  [/Generated with opencode/i, "opencode"],
  [/^Co-Authored-By:.*\bCodex\b/im, "codex"],
  [/^Co-Authored-By:.*\bCursor\b/im, "cursor"],
  [/^Co-Authored-By:.*\bClaude\b/im, "claude"],
  [/\(aider\)/i, "aider"],
];

const SESSION_TRAILERS = [
  /^Claude-Session:\s*(https?:\/\/\S+)/im,
  /^Agent-Logs-Url:\s*(https?:\/\/\S+)/im,
];

// ---- detection --------------------------------------------------------------

function fromLogin(login: string | undefined): AgentHit | null {
  if (!login) return null;
  const l = login.toLowerCase();
  for (const [name, agent] of LOGINS) if (l === name) return { agent, sessionUrl: null, signal: `login:${login}` };
  if (l.endsWith("[bot]")) return { agent: "bot", sessionUrl: null, signal: `login:${login}` };
  return null;
}

function fromText(text: string | undefined, where: string): AgentHit | null {
  if (!text) return null;
  for (const [re, agent] of TEXT) {
    if (re.test(text)) {
      let sessionUrl: string | null = null;
      for (const tr of SESSION_TRAILERS) {
        const m = tr.exec(text);
        if (m) {
          sessionUrl = m[1];
          break;
        }
      }
      return { agent, sessionUrl, signal: `${where}:${re.source.slice(0, 24)}` };
    }
  }
  return null;
}

function fromEmail(email: string | undefined, name: string | undefined, where: string): AgentHit | null {
  if (email) for (const [re, agent] of EMAILS) if (re.test(email)) return { agent, sessionUrl: null, signal: `${where}:${email}` };
  if (name && /^copilot$/i.test(name)) return { agent: "copilot", sessionUrl: null, signal: `${where}:${name}` };
  if (name && /\(aider\)/i.test(name)) return { agent: "aider", sessionUrl: null, signal: `${where}:${name}` };
  return null;
}

function fromBranch(ref: string | undefined): AgentHit | null {
  if (!ref) return null;
  for (const [re, agent] of BRANCHES) if (re.test(ref)) return { agent, sessionUrl: null, signal: `branch:${ref}` };
  return null;
}

/**
 * Inspect an event for agent fingerprints. Order: actor login (strongest),
 * then per-type payload details (commit trailers/authors, PR branch/body).
 */
export function detectAgent(ev: GhEvent): AgentHit | null {
  const p = ev.payload;
  const byActor = fromLogin(ev.actor?.login);
  if (byActor && byActor.agent !== "bot") return byActor;

  let hit: AgentHit | null = null;
  switch (ev.type) {
    case "PushEvent": {
      const commits: { message?: string; author?: { name?: string; email?: string } }[] = p.commits ?? [];
      for (const c of commits) {
        hit = fromText(c.message, "commit") ?? fromEmail(c.author?.email, c.author?.name, "author");
        if (hit) break;
      }
      hit ??= fromBranch((p.ref as string | undefined)?.replace(/^refs\/heads\//, ""));
      break;
    }
    case "PullRequestEvent":
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent": {
      const pr = p.pull_request ?? {};
      hit = fromLogin(pr.user?.login)
        ?? fromBranch(pr.head?.ref)
        ?? fromText(pr.body, "pr-body")
        ?? fromText(pr.title, "pr-title");
      if (hit?.agent === "bot" && !byActor) hit = null; // PR by a generic bot but human actor: not ours to flag
      break;
    }
    case "CreateEvent":
      hit = fromBranch(p.ref);
      break;
    default:
      break;
  }
  return hit ?? byActor;
}
