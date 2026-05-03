#!/usr/bin/env node
const { spawn } = require('child_process');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get electron binary path
const electronPath = require('electron');
process.env.ELECTRON_EXEC_PATH = electronPath;

const electronViteBin = path.join(__dirname, '../../node_modules/electron-vite/bin/electron-vite.js');
const electronRebuildBin = path.join(__dirname, '../../node_modules/.bin/electron-rebuild');
const args = ['dev', ...process.argv.slice(2)];

console.log('Starting electron-vite with ELECTRON_EXEC_PATH:', electronPath);

function rebuildNativeModulesForElectron() {
  const electronVersion = require('electron/package.json').version;
  const result = spawnSync(
    electronRebuildBin,
    ['-f', '-w', 'better-sqlite3', '-v', electronVersion],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveNodeForNativeTooling() {
  if (!process.execPath.includes('/Applications/Codex.app/')) {
    return process.execPath;
  }

  const pathCandidates = (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => path.join(entry, 'node'));
  const candidates = [...pathCandidates, '/opt/homebrew/bin/node', '/usr/local/bin/node'];

  for (const candidate of candidates) {
    if (!candidate || candidate.includes('/Applications/Codex.app/') || !fs.existsSync(candidate)) {
      continue;
    }

    const result = spawnSync(candidate, ['-p', 'process.execPath'], { encoding: 'utf8' });
    const nodePath = result.stdout.trim();
    if (result.status === 0 && nodePath && !nodePath.includes('/Applications/Codex.app/')) {
      return nodePath;
    }
  }

  return process.execPath;
}

const nodeForNativeTooling = resolveNodeForNativeTooling();
if (nodeForNativeTooling !== process.execPath) {
  console.log('Using external Node for native Vite/Rollup tooling:', nodeForNativeTooling);
}

rebuildNativeModulesForElectron();

const child = spawn(nodeForNativeTooling, [electronViteBin, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start electron-vite:', err);
  process.exit(1);
});
