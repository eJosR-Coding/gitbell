# Security

## Reporting

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/eJosR-Coding/gitbell/security/advisories/new).
Don't open a public issue for security problems.

## Model

GitBell follows Tauri's trust-boundary model: the webview is treated as
untrusted, Rust is the authority.

- **Token storage.** The GitHub token is stored in the OS keyring
  (Secret Service / KWallet, Windows Credential Manager, macOS Keychain),
  never in a plaintext file. The webview reads it through a Rust command and
  never persists it.
- **Capabilities.** The main window gets the minimum permission set. The
  opener plugin is scoped to `https://github.com/*`; there is no filesystem
  or shell access from the webview.
- **Asset protocol.** Scoped to `$APPDATA/sounds/**`. User-picked audio files
  are copied there by Rust after extension and size validation; the webview
  cannot read arbitrary paths.
- **CSP.** `default-src 'self'`, network only to `api.github.com`, images
  only from GitHub avatars, media only from the asset protocol.
- **Rendering untrusted content.** Commit messages, PR titles and comments
  come from strangers. They are inserted with `textContent`, never `innerHTML`.
- **Links.** URLs opened from toasts are validated in Rust to start with
  `https://github.com/` regardless of what the webview sends.
- **Single instance, no remote code.** The app bundles all its JS; nothing is
  loaded from the network at runtime.
- **Dependencies.** `cargo audit` runs on lockfile changes and weekly;
  Dependabot watches Cargo, npm and Actions.

## Out of scope for now

- Tauri's isolation pattern (no third-party runtime JS, so the added
  complexity buys little today).
- Signed auto-updates (planned together with macOS notarization).
