// GitHub event -> human sentence. This is the file you'll edit most when
// you want the toasts to say something different.

import type { EventCategory, GhEvent, Notice } from "./types";

const CATEGORY_OF: Record<string, EventCategory> = {
  PushEvent: "push",
  PullRequestEvent: "pr",
  PullRequestReviewEvent: "review",
  PullRequestReviewCommentEvent: "review",
  IssuesEvent: "issue",
  IssueCommentEvent: "comment",
  CommitCommentEvent: "comment",
  CreateEvent: "branch",
  DeleteEvent: "branch",
  ReleaseEvent: "release",
  WatchEvent: "social",
  ForkEvent: "social",
  MemberEvent: "social",
};

export function categoryOf(type: string): EventCategory | null {
  return CATEGORY_OF[type] ?? null;
}

const shortRef = (ref: string | undefined) => (ref ?? "").replace(/^refs\/heads\//, "");
const firstLine = (s: string | undefined) => (s ?? "").split("\n")[0].trim();
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Returns null for event types we don't narrate. */
export function toNotice(ev: GhEvent): Notice | null {
  const category = categoryOf(ev.type);
  if (!category) return null;

  const who = ev.actor.login;
  const repo = ev.repo.name;
  const p = ev.payload;
  const repoUrl = `https://github.com/${repo}`;

  let title = "";
  let body = "";
  let url = repoUrl;

  switch (ev.type) {
    case "PushEvent": {
      const branch = shortRef(p.ref);
      const n: number = p.size ?? p.commits?.length ?? 0;
      const msg = firstLine(p.commits?.[0]?.message);
      title = `${who} hizo push a ${repo}`;
      body = `${n} commit${n === 1 ? "" : "s"} en ${branch}${msg ? `: ${clip(msg)}` : ""}`;
      url = p.before && p.head ? `${repoUrl}/compare/${p.before}...${p.head}` : `${repoUrl}/commits/${branch}`;
      break;
    }
    case "PullRequestEvent": {
      const pr = p.pull_request ?? {};
      const num = p.number ?? pr.number;
      const verb =
        p.action === "opened" ? "abrió" :
        p.action === "closed" ? (pr.merged ? "mergeó" : "cerró") :
        p.action === "reopened" ? "reabrió" :
        p.action === "ready_for_review" ? "marcó listo para review" :
        p.action;
      title = `${who} ${verb} PR #${num} en ${repo}`;
      body = clip(pr.title ?? "");
      url = pr.html_url ?? repoUrl;
      break;
    }
    case "PullRequestReviewEvent": {
      const pr = p.pull_request ?? {};
      const state: string = p.review?.state ?? "";
      const verb =
        state === "approved" ? "aprobó" :
        state === "changes_requested" ? "pidió cambios en" :
        "comentó en";
      title = `${who} ${verb} PR #${pr.number} en ${repo}`;
      body = clip(pr.title ?? "");
      url = p.review?.html_url ?? pr.html_url ?? repoUrl;
      break;
    }
    case "PullRequestReviewCommentEvent": {
      const pr = p.pull_request ?? {};
      title = `${who} comentó código en PR #${pr.number} de ${repo}`;
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "IssuesEvent": {
      const is = p.issue ?? {};
      const verb = p.action === "opened" ? "abrió" : p.action === "closed" ? "cerró" : p.action;
      title = `${who} ${verb} issue #${is.number} en ${repo}`;
      body = clip(is.title ?? "");
      url = is.html_url ?? repoUrl;
      break;
    }
    case "IssueCommentEvent": {
      const is = p.issue ?? {};
      const kind = is.pull_request ? "PR" : "issue";
      title = `${who} comentó en ${kind} #${is.number} de ${repo}`;
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "CommitCommentEvent": {
      title = `${who} comentó un commit en ${repo}`;
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "CreateEvent": {
      // ref_type is "branch", "tag" or "repository"
      if (p.ref_type === "repository") {
        title = `${who} creó el repo ${repo}`;
      } else {
        title = `${who} creó ${p.ref_type === "tag" ? "el tag" : "la rama"} ${p.ref} en ${repo}`;
        url = `${repoUrl}/tree/${p.ref}`;
      }
      break;
    }
    case "DeleteEvent": {
      title = `${who} borró ${p.ref_type === "tag" ? "el tag" : "la rama"} ${p.ref} en ${repo}`;
      break;
    }
    case "ReleaseEvent": {
      const rel = p.release ?? {};
      title = `${who} publicó release ${rel.tag_name ?? ""} en ${repo}`;
      body = clip(rel.name ?? "");
      url = rel.html_url ?? repoUrl;
      break;
    }
    case "WatchEvent": {
      title = `${who} le dio star a ${repo}`;
      break;
    }
    case "ForkEvent": {
      title = `${who} forkeó ${repo}`;
      url = p.forkee?.html_url ?? repoUrl;
      break;
    }
    case "MemberEvent": {
      title = `${who} ${p.action === "added" ? "agregó" : p.action} a ${p.member?.login} en ${repo}`;
      break;
    }
  }

  return {
    id: ev.id,
    category,
    title,
    body,
    url,
    actor: who,
    avatar: ev.actor.avatar_url,
    repo,
    at: ev.created_at,
  };
}
