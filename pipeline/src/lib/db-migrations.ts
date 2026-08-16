import type Database from 'better-sqlite3';
import { CLIP_EMBEDDING_DIM, FACE_EMBEDDING_DIM } from 'shared';
import { clearAllFaceData } from './db-face-reset';

function getColumnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  columnNames: Set<string>,
  column: string,
  definition: string,
): void {
  if (columnNames.has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  columnNames.add(column);
}

// Migrations `user_version` : inchrémental, idempotent par version.
export function runDatabaseMigrations(db: Database.Database, vecLoaded: boolean): void {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 2) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'file_hash', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'dhash', 'TEXT');

    db.exec('CREATE INDEX IF NOT EXISTS idx_images_file_hash ON images(file_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_dhash ON images(dhash)');

    db.exec(`
        CREATE TABLE IF NOT EXISTS dismissed_duplicates (
          image_id_1 INTEGER NOT NULL,
          image_id_2 INTEGER NOT NULL,
          dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (image_id_1, image_id_2),
          FOREIGN KEY (image_id_1) REFERENCES images(id) ON DELETE CASCADE,
          FOREIGN KEY (image_id_2) REFERENCES images(id) ON DELETE CASCADE
        )
      `);

    db.pragma('user_version = 2');
  }

  if (version < 3) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'camera_make', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'camera_model', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'aperture', 'REAL');
    addColumnIfMissing(db, 'images', imageColumns, 'iso', 'INTEGER');
    addColumnIfMissing(db, 'images', imageColumns, 'exposure_time', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'focal_length', 'REAL');

    db.pragma('user_version = 3');
  }

  if (version < 4) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'faces_scanned', 'BOOLEAN DEFAULT 0');

    db.exec(`
        CREATE TABLE IF NOT EXISTS persons (
          id INTEGER PRIMARY KEY,
          name TEXT,
          thumbnail_face_id INTEGER,
          face_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS faces (
          id INTEGER PRIMARY KEY,
          image_id INTEGER NOT NULL,
          person_id INTEGER,
          bbox_x REAL NOT NULL,
          bbox_y REAL NOT NULL,
          bbox_w REAL NOT NULL,
          bbox_h REAL NOT NULL,
          confidence REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
          FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL
        )
      `);

    if (vecLoaded) {
      db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_faces USING vec0(
            embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
          )
        `);

      db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_persons USING vec0(
            embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
          )
        `);
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_faces_image ON faces(image_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)');

    db.pragma('user_version = 5');
  }

  if (version >= 4 && version < 5 && vecLoaded) {
    // Vec tables were created with default (L2) distance. Recreate with cosine
    // and wipe all persons so clustering is re-run on next scan.
    db.exec('DROP TABLE IF EXISTS vec_faces');
    db.exec('DROP TABLE IF EXISTS vec_persons');
    db.exec(`
        CREATE VIRTUAL TABLE vec_faces USING vec0(
          embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
        )
      `);
    db.exec(`
        CREATE VIRTUAL TABLE vec_persons USING vec0(
          embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
        )
      `);
    db.exec('DELETE FROM faces');
    db.exec('DELETE FROM persons');
    db.exec('UPDATE images SET faces_scanned = 0');
    db.pragma('user_version = 5');
  }

  if (version < 6) {
    const folderColumns = getColumnNames(db, 'folders');
    addColumnIfMissing(db, 'folders', folderColumns, 'available', 'BOOLEAN DEFAULT 1');

    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'missing', 'BOOLEAN DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_missing ON images(missing)');

    db.pragma('user_version = 6');
  }

  if (version < 7) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'website_link', 'TEXT');

    db.exec(`
        CREATE TABLE IF NOT EXISTS link_previews (
          url_hash TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT,
          description TEXT,
          site_name TEXT,
          image_path TEXT,
          fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          error TEXT
        )
      `);

    db.pragma('user_version = 7');
  }

  if (version < 8) {
    const folderColumns = getColumnNames(db, 'folders');
    addColumnIfMissing(db, 'folders', folderColumns, 'exclude_from_face_scan', 'BOOLEAN DEFAULT 0');
    db.pragma('user_version = 8');
  }

  if (version < 9) {
    const imageTagColumns = getColumnNames(db, 'image_tags');
    addColumnIfMissing(db, 'image_tags', imageTagColumns, 'position', 'INTEGER');
    db.exec('CREATE INDEX IF NOT EXISTS idx_image_tags_position ON image_tags(tag_id, position)');
    db.pragma('user_version = 9');
  }

  if (version < 10) {
    const folderColumns = getColumnNames(db, 'folders');
    addColumnIfMissing(db, 'folders', folderColumns, 'writable', 'BOOLEAN DEFAULT 1');
    db.pragma('user_version = 10');
  }

  if (version < 11) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'palette_json', 'TEXT');

    // Authoritative vec_palette invariant: palette_colors.id is the matching
    // vec_palette.rowid. This regular table owns the autoincrement id; mirror
    // the faces + vec_faces split and bind vec_palette rowids as BigInt.
    db.exec(`
        CREATE TABLE IF NOT EXISTS palette_colors (
          id INTEGER PRIMARY KEY,
          image_id INTEGER NOT NULL,
          color_idx INTEGER NOT NULL,
          weight REAL NOT NULL,
          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        )
      `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_palette_colors_image ON palette_colors(image_id)');

    if (vecLoaded) {
      // Default L2 on Lab approximates Delta E 76; lightness magnitude matters here.
      db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_palette USING vec0(
            lab float[3]
          )
        `);
    }

    db.pragma('user_version = 11');
  }

  if (version < 12) {
    // Palette space switched from CIELAB to OKLab. Stored vectors and query
    // vectors must share a space or nearest-neighbor search is garbage, so
    // wipe existing palette data: `getImagesMissingPalette` will surface
    // these for recomputation.
    if (vecLoaded) {
      db.exec('DELETE FROM vec_palette');
    }
    db.exec('DELETE FROM palette_colors');
    db.exec('UPDATE images SET palette_json = NULL');

    db.pragma('user_version = 12');
  }

  if (version < 13) {
    db.exec('DROP TABLE IF EXISTS metadata_changes');
    db.pragma('user_version = 13');
  }

  if (version < 14) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'ocr_status', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'ocr_at', 'INTEGER');

    // block_index: ordering within an image (top-to-bottom, left-to-right).
    // polygon_json: four corner points for rotated text. Plain bbox is the
    //   axis-aligned enclosing rectangle for quick overlay/hit-testing.
    db.exec(`
        CREATE TABLE IF NOT EXISTS image_ocr (
          image_id INTEGER NOT NULL,
          block_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          bbox_x REAL NOT NULL,
          bbox_y REAL NOT NULL,
          bbox_w REAL NOT NULL,
          bbox_h REAL NOT NULL,
          polygon_json TEXT,
          confidence REAL NOT NULL,
          PRIMARY KEY (image_id, block_index),
          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        )
      `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_image_ocr_image ON image_ocr(image_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_ocr_status ON images(ocr_status)');

    db.pragma('user_version = 14');
  }

  if (version < 16) {
    if (vecLoaded) {
      db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_face_clips USING vec0(
            embedding float[${CLIP_EMBEDDING_DIM}] distance_metric=cosine
          )
        `);
    }
    clearAllFaceData(db, vecLoaded);

    db.pragma('user_version = 16');
  }

  if (version < 19) {
    clearAllFaceData(db, vecLoaded);
    db.pragma('user_version = 19');
  }

  if (version < 20) {
    const imageColumns = getColumnNames(db, 'images');
    addColumnIfMissing(db, 'images', imageColumns, 'file_mtime_ms', 'REAL');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_images_file_path_size_mtime ON images(file_path, file_size, file_mtime_ms)',
    );

    db.pragma('user_version = 20');
  }

  if (version < 21) {
    const imageColumns = getColumnNames(db, 'images');
    // NULL drives the backfill queue; `unknown` marks an examined image.
    addColumnIfMissing(db, 'images', imageColumns, 'origin_kind', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'origin_domain', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'origin_at', 'TEXT');
    addColumnIfMissing(db, 'images', imageColumns, 'website_link_source', 'TEXT');

    db.exec('CREATE INDEX IF NOT EXISTS idx_images_origin_kind ON images(origin_kind)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_origin_domain ON images(origin_domain)');

    // Existing links predate OS inference and must remain protected.
    db.exec("UPDATE images SET website_link_source = 'user' WHERE website_link IS NOT NULL");

    db.pragma('user_version = 21');
  }
}
