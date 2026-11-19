// Fails the build when packaging regresses: stray build output, sources or
// native build leftovers inside app.asar, or an asar far above its usual size.
// Usage: node scripts/check-bundle-size.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const MAX_ASAR_MB = 40;
const FORBIDDEN = [
  { pattern: /^\/build\//, reason: 'build output (e.g. Xcode DerivedData)' },
  { pattern: /^\/src\//, reason: 'TypeScript sources' },
  { pattern: /^\/out\//, reason: 'packaging output' },
  { pattern: /\.wasm$/, reason: 'wasm runtimes (unused under Node)' },
  { pattern: /\/better-sqlite3\/deps\//, reason: 'sqlite amalgamation sources' },
  { pattern: /\/@gutenye\/ocr-models\/assets\//, reason: 'duplicate OCR models' },
];

function findAsars(dir, depth = 0) {
  if (depth > 5 || !fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === 'app.asar') found.push(full);
    else if (entry.isDirectory() && !entry.name.endsWith('.asar.unpacked')) {
      found.push(...findAsars(full, depth + 1));
    }
  }
  return found;
}

const outDir = path.resolve(process.argv[2] ?? 'out');
const asars = findAsars(outDir);
if (asars.length === 0) {
  console.error(`[bundle-size] no app.asar found under ${outDir}`);
  process.exit(1);
}

let failed = false;
for (const file of asars) {
  const sizeMb = fs.statSync(file).size / 1048576;
  const entries = asar.listPackage(file, { isPack: false });
  const problems = [];
  for (const { pattern, reason } of FORBIDDEN) {
    const hit = entries.find((entry) => pattern.test(entry));
    if (hit) problems.push(`${reason}: ${hit}`);
  }
  const ortTargets = new Set(
    entries
      .map(
        (entry) => entry.match(/\/onnxruntime-node\/bin\/[^/]+\/([^/]+\/[^/]+)\/[^/]+\.node$/)?.[1],
      )
      .filter(Boolean),
  );
  if (ortTargets.size !== 1) {
    const found = ortTargets.size ? [...ortTargets].join(', ') : 'none';
    problems.push(`expected onnxruntime binaries for exactly one target, found: ${found}`);
  }
  if (sizeMb > MAX_ASAR_MB)
    problems.push(`app.asar is ${sizeMb.toFixed(1)} MB (max ${MAX_ASAR_MB} MB)`);

  // win/linux: electronLanguages must leave Chromium's locale pak in place.
  const localesDir = path.join(path.dirname(file), '..', 'locales');
  if (fs.existsSync(localesDir) && !fs.existsSync(path.join(localesDir, 'en-US.pak'))) {
    problems.push('locales/en-US.pak is missing (check electronLanguages)');
  }

  const label = path.relative(outDir, file);
  if (problems.length > 0) {
    failed = true;
    console.error(`[bundle-size] ${label}\n  - ${problems.join('\n  - ')}`);
  } else {
    console.log(`[bundle-size] ${label}: ${sizeMb.toFixed(1)} MB, ok`);
  }
}
process.exit(failed ? 1 : 0);
