# Release Guide

Sortie ships unsigned installers. Code signing + notarization are planned follow-ups.

## Cutting a release

1. Bump the version in **both** `package.json` (root) and `electron/package.json`, and commit.
2. Tag and push:
   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. The `Release` workflow runs automatically on tag push (or trigger manually from the Actions tab):
   - Generates icons once on macOS, shares them via artifact.
   - Builds + publishes mac / windows / linux in parallel.
   - Uploads all artifacts to a **draft** GitHub release — edit the notes and publish when ready.

## Local builds

```sh
yarn build            # full clean compile (icons + code)
yarn dist:mac         # builds SortieFinderSync.appex, then Sortie-<ver>-arm64.dmg + Sortie-<ver>-x64.dmg
yarn dist:win         # Sortie-Setup-<ver>.exe (NSIS)
yarn dist:linux       # AppImage + .deb
```

Artifacts land in `electron/out/`. Cross-building Windows from macOS requires `brew install --cask wine-stable`.

## Smoke test checklist

For each platform, after install:

- [ ] App launches without crashing
- [ ] Menu bar / taskbar shows **Sortie** (never "Electron")
- [ ] `About Sortie` shows the correct version
- [ ] External links open in the system browser
- [ ] Add a folder, scan it, verify images + tags + faces pipelines work
- [ ] macOS: `Sortie.app/Contents/PlugIns/SortieFinderSync.appex` exists
- [ ] macOS: launch Sortie once, then enable **Sortie Finder Sync** in System Settings if macOS has not enabled it automatically
- [ ] macOS: right-click images/folders in Finder and verify Sortie actions appear
- [ ] macOS: Finder `Add Folder to Sortie Gallery` adds a watched folder and scans it
- [ ] macOS: Finder `Add to Sortie Board` opens Sortie's board picker

## macOS Finder Sync build requirements

Set these environment variables before `yarn dist:mac` on release machines:

```sh
export SORTIE_MAC_CODE_SIGN_IDENTITY="Developer ID Application: ..."
export SORTIE_MAC_DEVELOPMENT_TEAM="TEAMID1234"
```

`yarn dist:mac` builds the native Finder Sync extension with `xcodebuild`, embeds
`SortieFinderSync.appex` into `Sortie.app/Contents/PlugIns`, and lets
electron-builder sign the final app bundle.

## Release-notes boilerplate

### Windows — SmartScreen warning

SmartScreen may show "Windows protected your PC". Click **More info** → **Run anyway**.

## Future work

- Script Apple notarization credentials in CI.
- Windows Authenticode signing.
- Auto-updates via `electron-updater` (installed, not wired up).
- Script the dual version bump.
