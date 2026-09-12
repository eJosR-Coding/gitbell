# Contributing to GitBell

Thanks for taking a look! GitBell is small on purpose, so contributions are
easy to review and easy to land.

## Setup

1. Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
   for your OS (Rust stable, Node 22, pnpm, and the WebKit/WebView2 system
   libraries).
2. `pnpm install`
3. `pnpm tauri dev`

## Where things live

| Path | What |
|---|---|
| `src-tauri/src/` | Rust: `lib.rs` builder, `tray.rs`, `notify.rs`, `secrets.rs`, `sounds.rs` |
| `src/core/` | Pure logic: GitHub client, poller, event formatter, types |
| `src/platform/` | Wrappers over Tauri commands and plugins |
| `src/ui/` | Settings window, no framework |

## Guidelines

- Keep Rust thin. If it can live in TypeScript, it lives in TypeScript.
- `src/core` must not import from `@tauri-apps/*`. Keep it pure.
- Every GitHub event type added to `format.ts` needs a category in
  `types.ts` so users can toggle it.
- Anything the webview sends to Rust is untrusted input: validate it in the
  command (see `notify.rs`, `sounds.rs`).
- Run `pnpm exec tsc --noEmit` and `cargo test --manifest-path src-tauri/Cargo.toml`
  before opening a PR. CI runs the same.
- Comments in English. UI strings are Spanish for now; i18n is on the roadmap.

## Reporting bugs

Open an issue with your OS, desktop environment (for Linux), the GitBell
version, and what you expected vs. what happened. Logs from `pnpm tauri dev`
help a lot.
