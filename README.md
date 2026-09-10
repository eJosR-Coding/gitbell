<p align="center">
  <img src="assets/banner.png" alt="GitBell: your commits, noticed." width="800">
</p>

# GitBell

/ˈɡɪt.bɛl/ (*git-bell*)
noun

1. a small desktop companion that rings when something happens in your repos.

[![CI](https://github.com/eJosR-Coding/gitbell/actions/workflows/ci.yml/badge.svg)](https://github.com/eJosR-Coding/gitbell/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/eJosR-Coding/gitbell?include_prereleases&label=release)](https://github.com/eJosR-Coding/gitbell/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20Windows-lightgrey)

GitBell is a lightweight desktop app that lives in your system tray and pops a
**native notification** the moment someone pushes, opens a pull request,
reviews, merges or releases in the repositories and organizations you care
about.

No server, no webhooks, no browser tab left open. Your machine asks GitHub
directly with your own token, once a minute, and the operating system shows
the toast. That's it.

## Features ⭐

- **Native toasts** on Linux (freedesktop) and Windows (WinRT). Clicking a
  toast on Linux opens the commit, PR or issue on GitHub.
- **Tray-first.** Close the window and GitBell keeps watching from the tray.
  Left click reopens it, right click for the menu.
- **Activity first.** The window opens on what happened in your repos, with
  who you're connected as. Settings live one tab over, and every event
  category has its toggle and sound on the same row.
- **Watch what you want.** A single repo (`owner/repo`), a whole organization
  (`org:name`) or everything you watch and follow (`@me`).
- **Pick your events.** Pushes, pull requests, reviews, issues, comments,
  branches and tags, releases, stars and forks. Each one is a toggle.
- **Sounds.** Two bundled chimes, a different one per event category, volume
  control, or bring your own audio file.
- **A mascot that rings its bell.** The tray icon plays a short animation when
  something new arrives. Because why not.
- **`gitbell notify` from any script.** Agents, CI, cron: if it can run a
  command, it can ring your bell. See below.
- **Knows when an agent did it.** Commits and PRs from Claude Code, Copilot,
  Codex, Cursor, OpenCode, Aider, Devin or Jules land in their own category,
  the toast names the agent, and the click opens the agent's session when the
  commit carried a link. Honest limits below.
- **Polite polling.** Honors GitHub's `X-Poll-Interval`, uses ETags so
  unchanged polls cost zero rate limit, and backs off automatically when
  throttled.
- **No spam on first run.** Adding a busy organization remembers where it is
  instead of dumping the last 90 days on you.
- **Starts with your session**, minimized to the tray, if you want it to.
- **English and Spanish.** Follows your system language, or pick one in settings.
- **Glass.** The window is translucent and asks the compositor to blur what's
  behind it: KDE Plasma (both the KDE and the new `ext_background_effect`
  protocols), Windows 11 acrylic, macOS vibrancy. A slider in settings sets
  the opacity; 100% is opaque. GNOME shows the tint without blur.
- **Three-step first run.** Token, what to watch (your busiest repos suggested), and a real notification from your own repo. Skippable, replayable from settings.
- **Tiny.** Built with Tauri v2: a few megabytes, not a bundled browser.

## How it works 🔔

```
┌──────────┐   every 60 s, with ETag   ┌────────────────────┐
│ GitBell  │ ────────────────────────▶ │ api.github.com     │
│ (tray)   │ ◀──────────────────────── │ /repos/:r/events   │
└────┬─────┘   200 new events / 304    │ /orgs/:o/events    │
     │                                  │ /users/:u/received │
     │ diff against last seen id        └────────────────────┘
     ▼
┌──────────┐
│ OS toast │  + sound + tray animation
└──────────┘
```

GitBell reads the public [GitHub Events API](https://docs.github.com/en/rest/activity/events).
It keeps the id of the newest event it has seen per target and only notifies
for events newer than that. Your token never leaves your machine except to
call `api.github.com`.

## Installation 💾

Grab the latest installer from the [Releases](https://github.com/eJosR-Coding/gitbell/releases) page:

| Platform | Package |
|---|---|
| Linux | `.deb`, `.rpm`, `.AppImage` |
| Windows | `.msi`, `.exe` |
| macOS | coming soon (the CI matrix entry is one uncomment away) |

### Token

GitBell needs a GitHub personal access token so it can see private repos and
organization activity.

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Scopes: `repo` (private repositories) and `read:org` (organization events)
3. Paste it into GitBell → **Cuenta** → **Guardar y verificar**

The token goes straight into your OS keyring (KWallet / GNOME Keyring on
Linux, Credential Manager on Windows). Settings live in the app data
directory (`~/.local/share/dev.ejos.gitbell/` on Linux,
`%APPDATA%\dev.ejos.gitbell\` on Windows) and never contain the token.

### Targets

| Syntax | Watches |
|---|---|
| `owner/repo` | one repository |
| `org:name` | every repository in an organization you belong to |
| `@me` | everything you watch or follow (your received-events feed) |

## Agents 🤖

GitHub has no "an agent did this" flag. GitBell reads the fingerprints the
tools leave by default: `Co-Authored-By` trailers, session-link trailers
(`Claude-Session:`, `Agent-Logs-Url:`), bot logins (`copilot-swe-agent[bot]`,
`claude[bot]`), branch prefixes (`claude/`, `copilot/`, `cursor/`) and PR
body markers. A hit moves the event to the **Agents** category with its own
toggle and sound, the toast reads "🤖 Claude Code (@you) pushed to …", and
the link prefers the agent's session. Your own agents count even with
"ignore my own activity" on, because cloud sessions push as you.

| Tool | Detected out of the box |
|---|---|
| Claude Code (CLI, desktop, web, GitHub Action) | yes |
| GitHub Copilot coding agent | yes, always |
| Codex (CLI, app, cloud) | yes |
| Cursor agent, OpenCode, Aider, Devin, Jules | yes |
| Gemini CLI, Cline, Roo Code, Kilo Code | no: they don't sign commits |

**The catch:** detection only works when the tool signs. If you turn
attribution off (every tool lets you), or use a tool that doesn't sign, the
commit is indistinguishable from yours, for GitBell and for anyone. For
those cases use the hook below: the agent tells GitBell directly, no git
forensics involved. Models (DeepSeek, GPT, Claude) are not tools; the mark
comes from whatever wraps them.

## Notify from scripts and agents 🤖

GitBell doubles as a local notification endpoint. While it's running in the
tray, any script can make it ring:

```sh
gitbell notify "Build finished" --body "all 212 tests green" --url https://ci.example.com/run/42
```

The second process hands its arguments to the running instance and exits;
you get the toast, the bell animation, the sound and a row in recent
activity. If GitBell isn't running, the command starts it in the tray and
shows the toast anyway. Flags: `--body`, `--url` (https only).

This is what makes GitBell useful with coding agents. Claude Code, for
example, can call it from a [hook](https://code.claude.com/docs/en/hooks)
every time it finishes a turn, so you know when a task is done even if
nothing was pushed yet. In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "gitbell notify \"Claude Code finished\" --body \"$(jq -r .cwd)\""
          }
        ]
      }
    ]
  }
}
```

To be told about every commit Claude Code makes, whether or not it signs
them, hook the `Bash` tool and look for `git commit`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "in=$(cat); echo \"$in\" | jq -e '.tool_input.command | test(\"git commit\")' >/dev/null && gitbell notify \"Claude Code committed\" --body \"$(echo \"$in\" | jq -r .cwd)\""
          }
        ]
      }
    ]
  }
}
```

Any tool that can run a shell command works the same way: CI scripts, long
test runs, deploys, cron jobs.

## Architecture 🧱

```
src/                       TypeScript, runs in the webview
├── core/                  pure logic, no Tauri imports
│   ├── github.ts          Events API client: ETag, X-Poll-Interval, rate limit
│   ├── poller.ts          the loop, dedupe by last seen event id
│   ├── format.ts          GitHub event → toast title/body/url
│   └── types.ts           shared shapes and defaults
├── platform/              thin wrappers over Tauri commands and plugins
│   ├── secrets.ts         token in the OS keyring
│   ├── settings.ts        JSON store for settings and state
│   ├── notify.ts          toasts and tray animation
│   └── sounds.ts          audio playback
├── ui/                    settings window, no framework
└── main.ts                wires the three layers together

src-tauri/src/             Rust, the trusted side
├── lib.rs                 builder, plugins, window lifecycle
├── cli.rs                 `gitbell notify` parsing, forwarded by single-instance
├── i18n.rs                tray menu and toast button strings
├── tray.rs                tray icon, menu, bell animation
├── notify.rs              freedesktop toasts with click-to-open
├── secrets.rs             keyring get/set/delete
└── sounds.rs              validated import of user audio files
```

Rust stays thin on purpose. Anything that doesn't need OS access lives in
`src/core`, which has no Tauri imports and is trivially unit-testable.

## Security 🔒

The webview is treated as untrusted and Rust is the authority. Token in the
OS keyring, least-privilege capabilities, opener scoped to `github.com`,
asset protocol scoped to the app's own sounds folder, strict CSP, and
`cargo audit` plus Dependabot in CI. Details in [SECURITY.md](SECURITY.md).

## Building from source 🛠

Prerequisites: Rust stable, Node 22, pnpm, and the
[Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.

```sh
git clone https://github.com/eJosR-Coding/gitbell.git
cd gitbell
pnpm install
pnpm tauri dev      # dev build with hot reload
pnpm tauri build    # installers land in src-tauri/target/release/bundle/
```

On Fedora the system libraries are:

```sh
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel dbus-devel
```

UI preview without Tauri: run `pnpm dev` and open `http://localhost:1420`
in a browser. `#ob=1`, `#ob=1c`, `#ob=2`, `#ob=3` render each onboarding
step with fake data; `#view=settings` the settings view; `#notoken` the
asleep state; no hash the activity view with sample notices.

Tests:

```sh
pnpm test                                        # TypeScript core (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml  # Rust
```

## Releasing 🚀

```sh
git tag v0.1.0
git push --tags
```

The release workflow builds Linux and Windows installers on GitHub-hosted
runners and attaches them to a draft release. You don't need a Windows machine.

## Roadmap 🗺

- [ ] macOS builds and notarization
- [ ] "Unread" dot on the tray icon until you open the window
- [ ] Do-not-disturb schedule
- [ ] Per-branch filters (`main` yes, `feature/*` no)
- [ ] Optional in-app toast window with the animated mascot

## Contributing 💬

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
for the project layout and a few ground rules.

## Support GitBell 💗

If GitBell saves you from refreshing GitHub one more time, a ⭐ on the repo
goes a long way.

## License

GitBell is released under the [MIT License](LICENSE).

Developed by **Joseph Rodriguez** · [@eJosR-Coding](https://github.com/eJosR-Coding)
