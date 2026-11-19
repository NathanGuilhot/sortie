import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pruneFrameworkLocales } = require('../../../scripts/prune-framework-locales.cjs') as {
  pruneFrameworkLocales: (frameworkResourcesDir: string) => string[];
};

let root: string;

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('pruneFrameworkLocales', () => {
  it('drops every framework locale except English and leaves other resources', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-prune-'));
    for (const locale of ['en', 'fr', 'ja']) {
      fs.mkdirSync(path.join(root, `${locale}.lproj`));
      fs.writeFileSync(path.join(root, `${locale}.lproj`, 'locale.pak'), '');
    }
    fs.writeFileSync(path.join(root, 'icudtl.dat'), '');

    const removed = pruneFrameworkLocales(root);

    expect(removed.map((dir) => path.basename(dir)).sort()).toEqual(['fr.lproj', 'ja.lproj']);
    expect(fs.readdirSync(root).sort()).toEqual(['en.lproj', 'icudtl.dat']);
  });

  it('is a no-op when the framework folder is missing', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-prune-'));
    expect(pruneFrameworkLocales(path.join(root, 'missing'))).toEqual([]);
  });
});
