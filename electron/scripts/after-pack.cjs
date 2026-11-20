const fs = require('node:fs');
const path = require('node:path');

exports.default = function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // electronLanguages doesn't prune the Electron framework's locales on macOS.
  const locales = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents/Frameworks/Electron Framework.framework/Resources',
  );
  for (const entry of fs.readdirSync(locales)) {
    if (entry.endsWith('.lproj') && entry !== 'en.lproj') {
      fs.rmSync(path.join(locales, entry), { recursive: true });
    }
  }

  const source = path.join(
    context.packager.projectDir,
    'build',
    'finder-sync',
    'SortieFinderSync.appex',
  );
  if (!fs.existsSync(source)) {
    throw new Error(
      `Finder Sync extension is missing at ${source}. Run "yarn workspace sortie-desktop build:finder-sync" before packaging macOS.`,
    );
  }

  const destination = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'PlugIns',
    'SortieFinderSync.appex',
  );
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  console.log(`[finder-sync] embedded ${destination}`);
};
