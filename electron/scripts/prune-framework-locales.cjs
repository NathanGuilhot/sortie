const fs = require('node:fs');
const path = require('node:path');

/**
 * Drop Chromium UI locales from Electron Framework.framework (~38 MB).
 * Sortie is English-only, and `electronLanguages` does not reach the
 * framework's .lproj folders on macOS. Runs in afterPack, before signing.
 * @param {string} frameworkResourcesDir Electron Framework.framework/Versions/A/Resources
 * @returns {string[]} removed paths
 */
function pruneFrameworkLocales(frameworkResourcesDir) {
  if (!fs.existsSync(frameworkResourcesDir)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(frameworkResourcesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.lproj') || entry.name === 'en.lproj') {
      continue;
    }
    const target = path.join(frameworkResourcesDir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}

module.exports = { pruneFrameworkLocales };
