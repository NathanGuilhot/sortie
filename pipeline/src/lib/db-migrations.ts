import type Database from 'better-sqlite3';
import { FACE_EMBEDDING_DIM } from 'shared';

// Migrations `user_version` : inchrémental, idempotent par version.
export function runDatabaseMigrations(db: Database.Database, vecLoaded: boolean): void {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 2) {
    const columns = db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('file_hash')) {
      db.exec('ALTER TABLE images ADD COLUMN file_hash TEXT');
    }
    if (!colNames.has('dhash')) {
      db.exec('ALTER TABLE images ADD COLUMN dhash TEXT');
    }

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
    const columns = db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('camera_make')) {
      db.exec('ALTER TABLE images ADD COLUMN camera_make TEXT');
    }
    if (!colNames.has('camera_model')) {
      db.exec('ALTER TABLE images ADD COLUMN camera_model TEXT');
    }
    if (!colNames.has('aperture')) {
      db.exec('ALTER TABLE images ADD COLUMN aperture REAL');
    }
    if (!colNames.has('iso')) {
      db.exec('ALTER TABLE images ADD COLUMN iso INTEGER');
    }
    if (!colNames.has('exposure_time')) {
      db.exec('ALTER TABLE images ADD COLUMN exposure_time TEXT');
    }
    if (!colNames.has('focal_length')) {
      db.exec('ALTER TABLE images ADD COLUMN focal_length REAL');
    }

    db.pragma('user_version = 3');
  }

  if (version < 4) {
    const columns = db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('faces_scanned')) {
      db.exec('ALTER TABLE images ADD COLUMN faces_scanned BOOLEAN DEFAULT 0');
    }

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
    const folderCols = db.prepare('PRAGMA table_info(folders)').all() as Array<{
      name: string;
    }>;
    const folderColNames = new Set(folderCols.map((c) => c.name));
    if (!folderColNames.has('available')) {
      db.exec('ALTER TABLE folders ADD COLUMN available BOOLEAN DEFAULT 1');
    }

    const imageCols = db.prepare('PRAGMA table_info(images)').all() as Array<{
      name: string;
    }>;
    const imageColNames = new Set(imageCols.map((c) => c.name));
    if (!imageColNames.has('missing')) {
      db.exec('ALTER TABLE images ADD COLUMN missing BOOLEAN DEFAULT 0');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_missing ON images(missing)');

    db.pragma('user_version = 6');
  }

  if (version < 7) {
    const imageCols = db.prepare('PRAGMA table_info(images)').all() as Array<{
      name: string;
    }>;
    const imageColNames = new Set(imageCols.map((c) => c.name));
    if (!imageColNames.has('website_link')) {
      db.exec('ALTER TABLE images ADD COLUMN website_link TEXT');
    }

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
    const folderCols = db.prepare('PRAGMA table_info(folders)').all() as Array<{
      name: string;
    }>;
    const folderColNames = new Set(folderCols.map((c) => c.name));
    if (!folderColNames.has('exclude_from_face_scan')) {
      db.exec('ALTER TABLE folders ADD COLUMN exclude_from_face_scan BOOLEAN DEFAULT 0');
    }
    db.pragma('user_version = 8');
  }

  if (version < 9) {
    const imageTagCols = db.prepare('PRAGMA table_info(image_tags)').all() as Array<{
      name: string;
    }>;
    const imageTagColNames = new Set(imageTagCols.map((c) => c.name));
    if (!imageTagColNames.has('position')) {
      db.exec('ALTER TABLE image_tags ADD COLUMN position INTEGER');
    }
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_image_tags_position ON image_tags(tag_id, position)',
    );
    db.pragma('user_version = 9');
  }

  if (version < 10) {
    const folderCols = db.prepare('PRAGMA table_info(folders)').all() as Array<{
      name: string;
    }>;
    const folderColNames = new Set(folderCols.map((c) => c.name));
    if (!folderColNames.has('writable')) {
      db.exec('ALTER TABLE folders ADD COLUMN writable BOOLEAN DEFAULT 1');
    }
    db.pragma('user_version = 10');
  }

  if (version < 11) {
    const imageCols = db.prepare('PRAGMA table_info(images)').all() as Array<{
      name: string;
    }>;
    const imageColNames = new Set(imageCols.map((c) => c.name));
    if (!imageColNames.has('palette_json')) {
      db.exec('ALTER TABLE images ADD COLUMN palette_json TEXT');
    }

    // Regular table holds per-color metadata (image_id, slot, weight) and
    // owns the autoincrement id used as the vec_palette rowid. Mirrors the
    // faces + vec_faces split.
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
    // wipe existing palette data — `getImagesMissingPalette` will surface
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
    const imageCols = db.prepare('PRAGMA table_info(images)').all() as Array<{
      name: string;
    }>;
    const imageColNames = new Set(imageCols.map((c) => c.name));
    if (!imageColNames.has('ocr_status')) {
      db.exec('ALTER TABLE images ADD COLUMN ocr_status TEXT');
    }
    if (!imageColNames.has('ocr_at')) {
      db.exec('ALTER TABLE images ADD COLUMN ocr_at INTEGER');
    }

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
}
