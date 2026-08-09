#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const builtApp = path.join(repoRoot, 'electron', 'out', 'mac-arm64', 'Sortie.app');
const installedApp = '/Applications/Sortie.app';
const extensionId = 'com.sortie.app.finder-sync';
const installedExtension = path.join(installedApp, 'Contents', 'PlugIns', 'SortieFinderSync.appex');

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('install:mac-local can only run on macOS.');
  }

  if (!fs.existsSync(builtApp)) {
    throw new Error(`Built app is missing at ${builtApp}. Run "yarn dist:mac" first.`);
  }

  verifyBundle(builtApp);
  assertElectronHelpersAllowLibraryValidation(builtApp);
  assertFinderSyncSandboxed(path.join(builtApp, 'Contents', 'PlugIns', 'SortieFinderSync.appex'));

  console.log(`[install:mac-local] installing ${builtApp} -> ${installedApp}`);
  fs.rmSync(installedApp, { recursive: true, force: true });
  run('ditto', [builtApp, installedApp]);

  verifyBundle(installedApp);
  assertElectronHelpersAllowLibraryValidation(installedApp);
  assertFinderSyncSandboxed(installedExtension);

  run(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', installedApp],
  );
  run('pluginkit', ['-a', installedExtension]);
  run('pluginkit', ['-e', 'use', '-i', extensionId]);
  assertFinderSyncEnabled();

  run('killall', ['Finder'], { allowFailure: true });
  console.log('[install:mac-local] installed Sortie and reloaded Finder.');
}

function verifyBundle(bundlePath) {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', bundlePath]);
}

function assertFinderSyncSandboxed(appexPath) {
  if (!fs.existsSync(appexPath)) {
    throw new Error(`Finder Sync extension is missing at ${appexPath}.`);
  }

  const result = run('codesign', ['-d', '--entitlements', '-', appexPath], {
    capture: true,
  });
  if (!result.output.includes('com.apple.security.app-sandbox')) {
    throw new Error(
      [
        `Finder Sync extension at ${appexPath} is not sandboxed.`,
        'Do not re-sign it with the host app entitlements or recursive codesign --deep.',
        'Rebuild with "yarn dist:mac" so electron-builder signs the app and extension separately.',
      ].join(os.EOL),
    );
  }
}

function assertElectronHelpersAllowLibraryValidation(appPath) {
  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
  const helpers = fs
    .readdirSync(frameworksPath)
    .filter((entry) => entry.startsWith('Sortie Helper') && entry.endsWith('.app'));

  for (const helper of helpers) {
    const helperPath = path.join(frameworksPath, helper);
    const result = run('codesign', ['-d', '--entitlements', '-', helperPath], { capture: true });
    if (!result.output.includes('com.apple.security.cs.disable-library-validation')) {
      throw new Error(
        `Electron helper ${helperPath} cannot load Electron Framework under the hardened runtime.`,
      );
    }
  }
}

function assertFinderSyncEnabled() {
  const result = run('pluginkit', ['-m', '-A', '-i', extensionId], { capture: true });
  if (!result.output.includes(`+    ${extensionId}`)) {
    throw new Error(
      `Finder Sync extension is not enabled after registration. pluginkit output:${os.EOL}${result.output}`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, output.trim()].filter(Boolean).join(os.EOL),
    );
  }

  return { output, status: result.status };
}

main();
