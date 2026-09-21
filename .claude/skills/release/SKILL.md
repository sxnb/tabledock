---
name: release
description: Cut a TableDock release — bump the version through a PR, tag it, build and notarize the Mac app, and collect the CI Windows/Linux builds into a draft GitHub release.
argument-hint: '[patch|minor|major]'
disable-model-invocation: true
---

# Release

Takes TableDock from `master` to a **draft** GitHub release holding every distributable for the next version. It ends at the draft; the human reviews the notes and publishes.

Bump level: `$ARGUMENTS`, or `patch` when empty.

The builds come from two places:

- **Mac** (Apple Silicon `.dmg`): built on this machine, which holds the Developer ID certificate and the notarization credentials.
- **Windows and Linux** (x64 and arm64): built by `.github/workflows/release.yml` on native runners when the tag is pushed, and attached to the draft by the workflow. They come only from CI: native modules (better-sqlite3, ssh2) can't be cross-compiled, so a Windows or Linux build made on the Mac ships macOS binaries and SQLite fails in it — the v0.0.2 bug.

State lives in git and GitHub, so a second run _resumes_ an interrupted release; see **Resuming** before starting over.

## 1. Preflight

Each check guards against something only the human can fix. On a failure, report it and stop.

- `git fetch origin --tags`, then: on `master`, no uncommitted changes to tracked files, and `master` matches `origin/master`.
- `gh auth status` succeeds.
- Notarization credentials are in the environment, as one of these sets:
  - `APPLE_KEYCHAIN_PROFILE` (preferred: the secret stays in the keychain)
  - `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`
  - `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`

  Without them electron-builder signs the app but skips notarization with only a log line, and Gatekeeper rejects the result, which is how v0.0.2 shipped. When they're missing, give the human the one-time keychain setup to run themselves (it prompts for an app-specific password):

  ```sh
  xcrun notarytool store-credentials tabledock-notary --apple-id <apple-id> --team-id K49VT3WJVW
  echo 'export APPLE_KEYCHAIN_PROFILE=tabledock-notary' >> ~/.zshrc
  ```

- `security find-identity -v -p codesigning` lists a `Developer ID Application` identity.
- `pnpm run typecheck`, `pnpm run lint` (warnings are fine), and `pnpm exec vitest run test/unit` pass.

Done when every check passes.

## 2. Pick the version

Read `version` from `package.json` and look for its tag, `v<version>`:

- **Tagged, and its GitHub release is published**: the normal case. The release version is the next one at the bump level; continue to step 3.
- **Not tagged**: an earlier run merged the bump but stopped before tagging. Release this version as it is; skip to step 4.
- **Tagged, with a draft release**: an earlier run stopped mid-build. Release this version; skip to step 5.
- **Tagged, with no release at all**: an earlier run stopped between tagging and drafting. Release this version from step 4, where `release.mjs` reuses a tag that points at `HEAD`.

Done when you know the release version `X.Y.Z` and which step comes next.

## 3. Bump through a pull request

`master` is protected: every change lands through a pull request, which needs no approvals.

1. `git switch -c release/vX.Y.Z`
2. Set `"version"` in `package.json` to `X.Y.Z`, and change nothing else. The lockfiles don't record the app's own version.
3. Commit as `Bump version to X.Y.Z`, push, and `gh pr create --title "Bump version to X.Y.Z" --body "Release vX.Y.Z."`.
4. `gh pr merge --merge --delete-branch`, then `git switch master && git pull`.

Done when `master` matches `origin/master` and its `package.json` says `X.Y.Z`.

## 4. Tag and draft the release

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/release.mjs --publish
```

It pushes the tag `vX.Y.Z`, which starts the Windows and Linux builds, then creates the draft release with notes grouped from the commit subjects since the last tag.

Done when `gh release view vX.Y.Z` shows a draft.

## 5. Build the Mac app

Run `pnpm run build:mac`; notarization makes it take several minutes. Then prove the result:

- `spctl -a -vv -t exec dist/mac-arm64/TableDock.app` reports `source=Notarized Developer ID`.
- `node scripts/check-native-modules.mjs dist/mac-arm64 darwin arm64` passes.

Upload the disk image alone: `gh release upload vX.Y.Z dist/tabledock-X.Y.Z-arm64.dmg`. The `.zip` and `latest-*.yml` files next to it are for an auto-updater that isn't set up yet.

Done when the `.dmg` is attached to the draft.

## 6. Collect the CI builds

Find the tag's run with `gh run list --workflow release.yml --branch vX.Y.Z`, and follow it with `gh run watch <run-id> --exit-status`.

If a job fails, read `gh run view <run-id> --log-failed` and report the cause. Rerun with `gh run rerun <run-id> --failed` only when the failure is in the infrastructure (runner, network, download). A failing build needs a code fix; see **Resuming**.

Done when the run has succeeded and `gh release view vX.Y.Z --json assets --jq '.assets[].name'` lists seven files for `X.Y.Z`: one `.dmg`, two `-setup.exe` (x64, arm64), two `.AppImage`, and two `.deb`.

## 7. Hand over

Report the draft's URL and its seven files. The human edits the notes if needed, and publishes.

## Resuming

A rerun reads where the last one stopped (step 2) and continues from there. The one case it can't recover by itself is a build that needs a code fix, because the tag points at the broken commit:

1. With the human's go-ahead, delete the draft and the tag: `gh release delete vX.Y.Z --cleanup-tag --yes && git tag -d vX.Y.Z`.
2. The fix lands on `master` through its own pull request.
3. Run the skill again. The version is untagged now, so step 2 skips the bump and the release is rebuilt from the fixed `master`.
