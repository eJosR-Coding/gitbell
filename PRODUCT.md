# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: solo developers who work across several repositories and
organizations and don't want to keep GitHub open to know what happened.
Second, and growing: developers who launch coding agents (Claude Code,
Copilot coding agent, Codex, Cursor) and need to know when an agent pushed,
opened a PR or finished, without polling the session.

Situation: the app runs all day in the system tray on a developer's Linux
or Windows machine while they work in an editor and a terminal. They look
at it for seconds, not minutes.

## Product Purpose

GitBell shows native desktop notifications for GitHub activity (pushes, PRs,
reviews, issues, releases) in the repos and orgs the user chooses, plus
`gitbell notify` so scripts and agents can ring it directly. Success: the
user hears the bell and knows what happened without switching context.
First value: seeing one real notification from their own repo.

## Positioning

No server, no webhooks, no browser tab: the user's own token, polled
politely from their own machine. The only notifier that treats coding agents
as first-class actors (detects their commits and PRs, links to their
sessions) and that any local script can ring.

## Operating Context

- Lives in the tray; the window is settings only, opened rarely.
- Linux (KDE Plasma and GNOME, Wayland) and Windows. macOS later.
- WebKitGTK on Linux, WebView2 on Windows: the UI must work in both.
- GitHub personal access token with `repo` and `read:org`, stored in the OS
  keyring.
- Claude Code hooks call `gitbell notify` from the terminal.

## Capabilities and Constraints

- Targets: `owner/repo`, `org:name`, `@me`.
- Event categories with per-category toggle and sound, bundled chimes or a
  user file.
- Tray animation (8-frame bell sprite) on every notice.
- Languages: Spanish and English, following the OS locale.
- Onboarding may be skipped ("configure later"); without a token the app
  idles and the header says so.
- CSP forbids any network resource except api.github.com and GitHub
  avatars; fonts and libraries must be bundled.
- Undecided: agent detection heuristics, unread indicator on the tray icon,
  in-app toast window.

## Brand Commitments

- Name: GitBell. Tagline: "Your commits, noticed."
- Mascot: a red Git-diamond character holding a golden bell, black limbs,
  big eyes. Assets: `assets/logo.png`, `assets/banner.png`,
  `assets/sprite.png` (8 ringing frames), `src/ui/sprite-strip.png`.
  Poses in `assets/poses/` (originals) and `src/ui/poses/` (512px, trimmed):
  `wave`, `think`, `celebrate`. Still missing: `wait`, `error`. Slots exist
  for all five; missing ones fall back to the bell frame. Don't fabricate.
- Voice: close, direct, a little playful; the mascot guides and celebrates,
  never nags.
- Author: Joseph Rodriguez, GitHub eJosR-Coding. MIT.

## Evidence on Hand

- Working app with verified toasts, tray animation and CLI on Linux.
- No testimonials, metrics or user quotes exist; do not invent any.

## Product Principles

1. Time to the first real notification beats completeness.
2. Every onboarding step is the real setup, never a slide.
3. Rust is the authority; the webview is untrusted.
4. The mascot reacts to what happens; it never blocks or lectures.
5. Nothing loads from the network at runtime except GitHub's API.
