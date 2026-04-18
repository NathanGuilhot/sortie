# Release Guide

Sortie ships unsigned installers for v0.1.0. Code signing + notarization are planned follow-ups.

## Versioning

Bump the version in **both** `package.json` files before building:

- `/package.json` (root workspace)
- `/electron/package.json` (source of truth for `app.getVersion()` and electron-builder)

Keep them in sync until we script it.

## Build commands

Run from the repo root:

```sh
yarn build            # sanity-check a full clean compile
yarn dist:mac         # macOS: Sortie-<ver>-arm64.dmg + Sortie-<ver>-x64.dmg
yarn dist:win         # Windows: Sortie-Setup-<ver>.exe (NSIS)
yarn dist:linux       # Linux: AppImage + .deb
```

Artifacts land in `electron/out/`.

### Cross-building Windows from macOS

`yarn dist:win` on macOS requires Wine to build the NSIS installer:

```sh
brew install --cask wine-stable
```

If Wine is not available, build on a Windows machine or VM.

## Smoke test checklist

For each platform, after install:

- [ ] App launches without crashing
- [ ] Menu bar / taskbar shows **Sortie** (never "Electron")
- [ ] `About Sortie` (macOS: app menu; Win/Linux: Help menu) shows the correct version
- [ ] External links (GitHub, License) open in the system browser
- [ ] Add a folder, scan it, verify images + tags + faces pipelines work

## User-facing install notes

Include these in release notes since v0.1.0 installers are unsigned:

### macOS — Gatekeeper warning

On first launch, macOS will block the app as "damaged" or "from an unidentified developer".
Workaround:
1. Open **Applications**, right-click **Sortie**, choose **Open**
2. In the confirmation dialog, click **Open** again

You only need to do this once. If macOS still refuses, run in Terminal:
```sh
xattr -cr /Applications/Sortie.app
```

### Windows — SmartScreen warning

When running `Sortie-Setup-<ver>.exe`, SmartScreen may show "Windows protected your PC".
Click **More info** → **Run anyway**.

## Publishing

No automation yet. Attach the artifacts from `electron/out/` to a GitHub release manually.

## Future work

- Apple Developer ID code signing + notarization (requires membership).
- Windows Authenticode signing.
- Auto-updates via `electron-updater` (already installed, not wired up).
- GitHub Actions to build + attach artifacts on tag push.
