import type Database from 'better-sqlite3';
import { CLIP_EMBEDDING_DIM, DEFAULT_TAG_COLOR } from 'shared';

// Schéma initial : tables et index (les évolutions passent par db-migrations).
export function setupDatabaseSchema(db: Database.Database, vecLoaded: boolean): void {
  if (vecLoaded) {
    db.exec(`SELECT vec_version()`);
  }

  db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        width INTEGER,
        height INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        captured_at DATETIME,
        latitude REAL,
        longitude REAL,
        city TEXT,
        country TEXT,
        description TEXT,
        favorite BOOLEAN DEFAULT 0,
        hidden BOOLEAN DEFAULT 0
      )
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT,
        color TEXT DEFAULT '${DEFAULT_TAG_COLOR}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS image_tags (
        image_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        source TEXT DEFAULT 'user',
        confidence REAL,
        position INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (image_id, tag_id),
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

  if (vecLoaded) {
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(
          embedding float[${CLIP_EMBEDDING_DIM}]
        )
      `);
  }

  db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        watched BOOLEAN DEFAULT 1,
        ignored BOOLEAN DEFAULT 0,
        exclude_from_face_scan BOOLEAN DEFAULT 0,
        last_scanned DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        available BOOLEAN DEFAULT 1,
        writable BOOLEAN DEFAULT 1
      )
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cluster_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS collection_images (
        collection_id INTEGER NOT NULL,
        image_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection_id, image_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
      )
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS dismissed_suggestions (
        image_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (image_id, tag_id),
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_captured_at ON images(captured_at)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_location ON images(latitude, longitude)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_image ON image_tags(image_id)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_image ON dismissed_suggestions(image_id)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_tag ON dismissed_suggestions(tag_id)
    `);
  db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_source ON image_tags(source)
    `);

  db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
}
