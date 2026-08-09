import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const electronMainRoot = path.join(repoRoot, 'electron/src/main');

const forbiddenDatabaseAccess = [
  { description: '.prepare(', pattern: /\.prepare\s*\(/ },
  { description: 'getDatabase(', pattern: /\bgetDatabase\s*\(/ },
];

function findForbiddenDatabaseAccess(source: string): string[] {
  return forbiddenDatabaseAccess
    .filter(({ pattern }) => pattern.test(source))
    .map(({ description }) => description);
}

function listProductionTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listProductionTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('Electron main data-layer boundary', () => {
  it('detects both forbidden raw database escape hatches', () => {
    expect(findForbiddenDatabaseAccess('db.prepare("SELECT 1")')).toEqual(['.prepare(']);
    expect(findForbiddenDatabaseAccess('service.getDatabase()')).toEqual(['getDatabase(']);
  });

  it('keeps raw SQL and database-handle access out of production Electron main code', () => {
    const violations = listProductionTypeScriptFiles(electronMainRoot).flatMap((filePath) => {
      const accesses = findForbiddenDatabaseAccess(fs.readFileSync(filePath, 'utf8'));
      return accesses.map(
        (access) => `${path.relative(repoRoot, filePath)} contains forbidden ${access}`,
      );
    });

    expect(
      violations,
      'Electron main must use pipeline repositories; see architecture epic #6 (A4/A5).',
    ).toEqual([]);
  });
});
