import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const electronDir = path.resolve(path.dirname(__filename), '..');
const repoRoot = path.resolve(electronDir, '..');
const projectPath = path.join(repoRoot, 'macos', 'SortieFinderSync', 'SortieFinderSync.xcodeproj');
const derivedDataPath = path.join(electronDir, 'build', 'finder-sync', 'DerivedData');
const artifactDir = path.join(electronDir, 'build', 'finder-sync');
const builtAppExtensionPath = path.join(
  derivedDataPath,
  'Build',
  'Products',
  'Release',
  'SortieFinderSync.appex',
);
const artifactAppExtensionPath = path.join(artifactDir, 'SortieFinderSync.appex');

if (process.platform !== 'darwin') {
  console.log('[finder-sync] skipping build on non-macOS host');
  process.exit(0);
}

fs.rmSync(artifactAppExtensionPath, { recursive: true, force: true });
fs.mkdirSync(artifactDir, { recursive: true });

const codeSignIdentity = process.env.SORTIE_MAC_CODE_SIGN_IDENTITY ?? '-';
const developmentTeam = process.env.SORTIE_MAC_DEVELOPMENT_TEAM;
const args = [
  '-project',
  projectPath,
  '-scheme',
  'SortieFinderSync',
  '-configuration',
  'Release',
  '-derivedDataPath',
  derivedDataPath,
  'CODE_SIGN_STYLE=Manual',
  `CODE_SIGN_IDENTITY=${codeSignIdentity}`,
];

if (developmentTeam) {
  args.push(`DEVELOPMENT_TEAM=${developmentTeam}`);
}

console.log('[finder-sync] building SortieFinderSync.appex');
const result = spawnSync('xcodebuild', args, { stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(builtAppExtensionPath)) {
  console.error(`[finder-sync] expected build output missing: ${builtAppExtensionPath}`);
  process.exit(1);
}

fs.cpSync(builtAppExtensionPath, artifactAppExtensionPath, { recursive: true });
console.log(`[finder-sync] wrote ${artifactAppExtensionPath}`);
