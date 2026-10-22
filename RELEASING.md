# Releasing GitBell

A release is a git tag. Pushing a tag that matches `v*` runs
`.github/workflows/release.yml`, which builds the installers, signs the
updater artifacts and attaches everything to a **draft** GitHub Release.
Publishing that draft is the step that reaches users.

## What the workflow does

| Item | Detail |
|---|---|
| Trigger | `push` of a tag matching `v*`. `workflow_dispatch` also exists, but a manual run on a branch uses the branch name as the tag (`github.ref_name`), so do not use it to release. |
| Runners | `ubuntu-22.04` and `windows-latest` (macOS is commented out in the matrix). |
| Builds | Linux: `.deb`, `.rpm`, `.AppImage`. Windows: `.msi` and NSIS `.exe`. |
| Updater artifacts | `createUpdaterArtifacts: true` adds a `.sig` next to each installer (and the AppImage/NSIS/MSI update payloads). |
| Signing | `TAURI_SIGNING_PRIVATE_KEY` repository secret (minisign key, empty password). The matching public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Windows installers themselves are not code-signed. |
| Release object | `tauri-action` creates the release named `GitBell <tag>` as a draft, not a prerelease, and uploads the assets plus `latest.json` (`includeUpdaterJson: true`). |
| Secrets required | `TAURI_SIGNING_PRIVATE_KEY` (set) and the automatic `GITHUB_TOKEN`. Nothing else. |

## How installed apps find an update

The app checks `https://github.com/eJosR-Coding/gitbell/releases/latest/download/latest.json`
20 seconds after start and every 6 hours. GitHub resolves `latest` to the
newest **published, non-draft, non-prerelease** release, so:

- A draft is invisible to users. Nothing ships until you click **Publish**.
- The `version` inside `latest.json` comes from `tauri.conf.json`, not from
  the tag. If they differ, the update will be offered (or hidden) wrongly.
- The updater verifies the `.sig` against the embedded public key before
  installing anything. A build signed with another key is rejected on the
  client.
- The updater only exists from 0.3.0 on. Copies of 0.2.1 and earlier must be
  upgraded by hand once.

Never rotate the signing key casually: installed apps trust only the public
key they shipped with, so a new key strands every existing install.

## Cutting a release

1. Start from a green `main`: CI passes and the dependency PRs you want are merged.
2. Choose the version by semver (pre-1.0: `0.MINOR.0` for features, `0.x.PATCH` for fixes only).
3. On a `release/vX.Y.Z` branch, bump the version in all four places, kept identical:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (`cargo update -p gitbell --offline` from `src-tauri/`)
4. Move the `## Unreleased` entries in `CHANGELOG.md` under `## X.Y.Z - YYYY-MM-DD`
   and write user-facing notes in `docs/release-notes/vX.Y.Z.md`.
5. Run the checks CI runs, plus a real bundle:
   ```sh
   pnpm exec tsc --noEmit
   pnpm test
   cargo test --manifest-path src-tauri/Cargo.toml
   pnpm tauri build --bundles deb   # needs TAURI_SIGNING_PRIVATE_KEY, any throwaway key works locally
   ```
   CI does not run `tauri build`, so this is the only place where npm/crate
   plugin version mismatches (they must match on major.minor) show up.
6. Commit as `chore(release): prepare vX.Y.Z`, open a PR, squash-merge.
7. Tag the merge commit and push the tag:
   ```sh
   git checkout main && git pull
   git tag -a vX.Y.Z -m "GitBell vX.Y.Z"
   git push origin vX.Y.Z
   ```
8. Watch the `release` workflow. When both matrix jobs are green, open the draft
   release, check that the assets include the `.sig` files and `latest.json`,
   paste `docs/release-notes/vX.Y.Z.md` as the description and click **Publish**.
9. Smoke-test: download `latest.json` from the release and confirm `version`
   and the `platforms` entries; install the previous version somewhere and watch
   the banner appear.

## Fixing a bad release

- Not published yet: delete the draft and the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), fix, retag.
- Already published: unpublish it (back to draft) so `latest` falls back to the previous release, then ship a new patch version. Do not reuse a version number.
