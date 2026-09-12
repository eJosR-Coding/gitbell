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
| `src-tauri/src/` | Rust: `lib.rs` builder, `cli.rs`, `tray.rs`, `notify.rs`, `secrets.rs`, `sounds.rs`, `i18n.rs` |
| `src/core/` | Pure logic: GitHub client, poller, event formatter, types |
| `src/platform/` | Wrappers over Tauri commands and plugins |
| `src/ui/` | Settings window and onboarding, no framework. `preview.ts` boots them in a plain browser with fake data |

## Product and design context

`PRODUCT.md` holds the product truth (users, purpose, constraints, brand
commitments) that UI work must respect. Read it before touching `src/ui`.

## Guidelines

- Keep Rust thin. If it can live in TypeScript, it lives in TypeScript.
- `src/core` must not import from `@tauri-apps/*`. Keep it pure.
- Every GitHub event type added to `format.ts` needs a category in
  `types.ts` so users can toggle it.
- Anything the webview sends to Rust is untrusted input: validate it in the
  command (see `notify.rs`, `sounds.rs`).
- Run `pnpm exec tsc --noEmit`, `pnpm test` and
  `cargo test --manifest-path src-tauri/Cargo.toml` before opening a PR.
  CI runs the same.
- Comments in English. Every user-visible string goes through `t()` in
  `src/core/i18n.ts` and must exist in both `es` and `en`; the i18n test
  fails otherwise. Rust has its own tiny table in `src-tauri/src/i18n.rs`
  for the tray menu and toast button.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`). Work on a branch,
  open a PR against `main`, CI must be green, squash-merge.

## Reporting bugs

Open an issue with your OS, desktop environment (for Linux), the GitBell
version, and what you expected vs. what happened. Logs from `pnpm tauri dev`
help a lot.
