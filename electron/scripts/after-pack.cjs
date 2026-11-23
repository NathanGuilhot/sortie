const fs = require('node:fs');
const path = require('node:path');

const OCR_MODEL_FILES = ['detection.onnx', 'recognition.onnx', 'dictionary.txt'];

function assertOcrModels(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  const missing = OCR_MODEL_FILES.filter(
    (name) => !fs.existsSync(path.join(resources, 'models', 'ocr', name)),
  );
  if (missing.length > 0) {
    throw new Error(
      `OCR models missing from the package (${missing.join(', ')}). Run "yarn workspace sortie-desktop fetch:ocr-models" before packaging.`,
    );
  }
}

exports.default = function afterPack(context) {
  assertOcrModels(context);
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
