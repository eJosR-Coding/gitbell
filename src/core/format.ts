// GitHub event -> human sentence. This is the file you'll edit most when
// you want the toasts to say something different.

import { t } from "./i18n";
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
      title = t("ev.push.title", { who, repo });
      body = t(n === 1 ? "ev.push.body" : "ev.push.bodyPlural", { n, branch }) + (msg ? `: ${clip(msg)}` : "");
      url = p.before && p.head ? `${repoUrl}/compare/${p.before}...${p.head}` : `${repoUrl}/commits/${branch}`;
      break;
    }
    case "PullRequestEvent": {
      const pr = p.pull_request ?? {};
      const num = p.number ?? pr.number;
      const key =
        p.action === "opened" ? "ev.pr.opened" :
        p.action === "closed" ? (pr.merged ? "ev.pr.merged" : "ev.pr.closed") :
        p.action === "reopened" ? "ev.pr.reopened" :
        p.action === "ready_for_review" ? "ev.pr.ready" :
        "ev.pr.other";
      title = t(key, { who, num, repo, action: p.action });
      body = clip(pr.title ?? "");
      url = pr.html_url ?? repoUrl;
      break;
    }
    case "PullRequestReviewEvent": {
      const pr = p.pull_request ?? {};
      const state: string = p.review?.state ?? "";
      const key =
        state === "approved" ? "ev.review.approved" :
        state === "changes_requested" ? "ev.review.changes" :
        "ev.review.commented";
      title = t(key, { who, num: pr.number, repo });
      body = clip(pr.title ?? "");
      url = p.review?.html_url ?? pr.html_url ?? repoUrl;
      break;
    }
    case "PullRequestReviewCommentEvent": {
      const pr = p.pull_request ?? {};
      title = t("ev.reviewComment", { who, num: pr.number, repo });
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "IssuesEvent": {
      const is = p.issue ?? {};
      const key = p.action === "opened" ? "ev.issue.opened" : p.action === "closed" ? "ev.issue.closed" : "ev.issue.other";
      title = t(key, { who, num: is.number, repo, action: p.action });
      body = clip(is.title ?? "");
      url = is.html_url ?? repoUrl;
      break;
    }
    case "IssueCommentEvent": {
      const is = p.issue ?? {};
      title = t(is.pull_request ? "ev.comment.pr" : "ev.comment.issue", { who, num: is.number, repo });
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "CommitCommentEvent": {
      title = t("ev.commitComment", { who, repo });
      body = clip(firstLine(p.comment?.body));
      url = p.comment?.html_url ?? repoUrl;
      break;
    }
    case "CreateEvent": {
      // ref_type is "branch", "tag" or "repository"
      if (p.ref_type === "repository") {
        title = t("ev.create.repo", { who, repo });
      } else {
        title = t(p.ref_type === "tag" ? "ev.create.tag" : "ev.create.branch", { who, ref: p.ref, repo });
        url = `${repoUrl}/tree/${p.ref}`;
      }
      break;
    }
    case "DeleteEvent": {
      title = t(p.ref_type === "tag" ? "ev.delete.tag" : "ev.delete.branch", { who, ref: p.ref, repo });
      break;
    }
    case "ReleaseEvent": {
      const rel = p.release ?? {};
      title = t("ev.release", { who, tag: rel.tag_name ?? "", repo });
      body = clip(rel.name ?? "");
      url = rel.html_url ?? repoUrl;
      break;
    }
    case "WatchEvent": {
      title = t("ev.star", { who, repo });
      break;
    }
    case "ForkEvent": {
      title = t("ev.fork", { who, repo });
      url = p.forkee?.html_url ?? repoUrl;
      break;
    }
    case "MemberEvent": {
      title = t("ev.member", { who, member: p.member?.login ?? "?", repo });
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
