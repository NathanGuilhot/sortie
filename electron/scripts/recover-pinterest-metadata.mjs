// One-shot recovery script: for every pinterest_<id>.<ext> file in the import
// folder whose DB row is missing description/website_link, fetch the pin's
// page from Pinterest, extract description + source URL, and patch the DB.
//
// Usage:  node electron/scripts/recover-pinterest-metadata.mjs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const IMPORT_DIR = path.join(os.homedir(), 'Pictures', 'Sortie', 'Imports');
const DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Sortie',
  'sortie.db',
);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let cachedCookie = null;
async function getCookie() {
  if (cachedCookie) return cachedCookie;
  const r = await fetch('https://www.pinterest.com/', {
    headers: { 'user-agent': UA },
    redirect: 'follow',
  });
  cachedCookie = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
  return cachedCookie;
}

// Reverse-engineered: the `RelatedModulesResource` endpoint returns the pin
// itself in the response when given a pin id. Even when Pinterest 404s the
// related-pins call we tried earlier, the pin's *own* metadata is in the
// embedded HTML of the pin page. Try the API first, fall back to scraping.

async function fetchPinFromHtml(pinId) {
  const cookie = await getCookie();
  const r = await fetch(`https://www.pinterest.com/pin/${pinId}/`, {
    headers: {
      'user-agent': UA,
      cookie,
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!r.ok) return null;
  const html = await r.text();

  // Pin pages embed an "__PWS_DATA__" or "__PWS_INITIAL_PROPS__" JSON blob
  // (and og:* meta tags as a backup).
  const ogDescription = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  )?.[1];
  const ogUrl = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']*)["']/i)?.[1];

  // Look for the embedded JSON. Pinterest stores pin data with the field "link"
  // for the source URL. Search for "link":"..." near the pin id we know.
  const decoded = (s) =>
    s ? s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/g, '/') : null;

  // Find the pin's source link via the embedded JSON.
  // It appears as JSON-escaped — match a URL that doesn't contain pinterest.com.
  let link = null;
  let description = null;

  // Look for the rich_summary url first (matches what the API returns)
  const richSummary = html.match(/"rich_summary"[^}]*?"url":"([^"]+)"/);
  if (richSummary) link = richSummary[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');

  // Fallback: find a "link":"..." adjacent to this pin's id
  if (!link) {
    const linkMatches = [
      ...html.matchAll(/"link":"((?:https?:\\?\/\\?\/[^"]+)|null)"/g),
    ];
    for (const m of linkMatches) {
      const candidate = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (candidate === 'null' || !candidate) continue;
      // Skip pinterest.com self-links (utm-tagged shares)
      try {
        const u = new URL(candidate);
        if (!/pinterest\./i.test(u.hostname)) {
          link = candidate;
          break;
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  // Description: prefer embedded "description":"..." (often longer than og:description)
  const embeddedDesc = html.match(/"description":"((?:\\.|[^"\\])*)"/);
  if (embeddedDesc) {
    try {
      description = JSON.parse(`"${embeddedDesc[1]}"`);
    } catch {
      description = null;
    }
  }
  if (!description) description = decoded(ogDescription);

  return {
    pinId,
    link: link?.trim() || null,
    description: description?.trim() || null,
    pinUrl: decoded(ogUrl) ?? `https://www.pinterest.com/pin/${pinId}/`,
  };
}

function sqlEscape(s) {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`db not found: ${DB_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(IMPORT_DIR)) {
    console.error(`import dir not found: ${IMPORT_DIR}`);
    process.exit(1);
  }

  // Get all pinterest_*.* files in import folder
  const files = fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => /^pinterest_(\d+)\./.test(f));
  console.log(`found ${files.length} pinterest files`);

  // Get all DB rows in import folder
  const rowsCsv = execSync(
    `sqlite3 -separator '|' '${DB_PATH}' "SELECT id, file_path, description, website_link FROM images WHERE file_path LIKE '%Sortie/Imports%'"`,
  )
    .toString()
    .trim();
  const rows = rowsCsv
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, file_path, description, website_link] = line.split('|');
      const filename = path.basename(file_path);
      const m = filename.match(/^pinterest_(\d+)\./);
      return {
        id: parseInt(id, 10),
        file_path,
        filename,
        pinId: m?.[1] ?? null,
        hasDescription: description && description.length > 0,
        hasLink: website_link && website_link.length > 0,
      };
    });
  console.log(`db has ${rows.length} rows in import folder`);

  // Build update list
  const targets = rows.filter((r) => r.pinId && (!r.hasDescription || !r.hasLink));
  console.log(`${targets.length} rows need recovery\n`);

  let patched = 0;
  let failed = 0;
  for (const t of targets) {
    process.stdout.write(`pin ${t.pinId} (id=${t.id})... `);
    try {
      const data = await fetchPinFromHtml(t.pinId);
      if (!data) {
        console.log('FAILED (no html)');
        failed++;
        continue;
      }
      const setClauses = [];
      if (!t.hasDescription && data.description) {
        setClauses.push(`description = ${sqlEscape(data.description)}`);
      }
      if (!t.hasLink && data.link) {
        setClauses.push(`website_link = ${sqlEscape(data.link)}`);
      }
      if (setClauses.length === 0) {
        console.log(`no metadata available (link=${data.link} desc=${!!data.description})`);
        failed++;
        continue;
      }
      const sql = `UPDATE images SET ${setClauses.join(', ')}, modified_at = datetime('now') WHERE id = ${t.id};`;
      execSync(`sqlite3 '${DB_PATH}' "${sql.replace(/"/g, '\\"')}"`);
      console.log(
        `patched (link=${data.link?.slice(0, 50) ?? '<none>'} desc=${data.description?.slice(0, 40) ?? '<none>'}…)`,
      );
      patched++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }
    // Be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\ndone: ${patched} patched, ${failed} failed`);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
