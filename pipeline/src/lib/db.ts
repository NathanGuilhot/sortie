import Database from 'better-sqlite3';
import { resolve } from 'path';
import { Image, Tag, ImageTag, Folder, DismissedSuggestion, MetadataChange } from 'shared';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.setupExtensions();
    this.setupSchema();
  }

  private setupPragmas() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  private setupExtensions() {
    // Load sqlite-vec extension if available
    try {
      this.db.loadExtension(resolve(__dirname, '../../node_modules/sqlite-vec/libvec0'));
    } catch (err) {
      console.warn('sqlite-vec extension not available:', err);
    }
  }

  private setupSchema() {
    // Enable vector extension
    this.db.exec(`SELECT vec_version()`);

    // Create images table
    this.db.exec(`
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

    // Create tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT,
        color TEXT DEFAULT '#6B7280',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create image_tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_tags (
        image_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        source TEXT DEFAULT 'user',
        confidence REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (image_id, tag_id),
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create vector embeddings table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(
        embedding float[512]
      )
    `);

    // Create folders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        watched BOOLEAN DEFAULT 1,
        ignored BOOLEAN DEFAULT 0,
        last_scanned DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create dismissed_suggestions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dismissed_suggestions (
        image_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (image_id, tag_id),
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create metadata_changes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata_changes (
        id INTEGER PRIMARY KEY,
        image_id INTEGER NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_captured_at ON images(captured_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_location ON images(latitude, longitude)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_image ON image_tags(image_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id)
    `);
  }

  // Basic CRUD methods
  insertImage(image: Omit<Image, 'id' | 'created_at' | 'modified_at'>): number {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO images (
        file_path, file_name, file_size, mime_type, width, height,
        captured_at, latitude, longitude, city, country, description,
        favorite, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      image.file_path,
      image.file_name,
      image.file_size,
      image.mime_type,
      image.width,
      image.height,
      image.captured_at,
      image.latitude,
      image.longitude,
      image.city,
      image.country,
      image.description,
      image.favorite ? 1 : 0,
      image.hidden ? 1 : 0
    );
    return result.lastInsertRowid as number;
  }

  insertEmbedding(rowid: number, embedding: number[]) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vec_images (rowid, embedding) VALUES (?, ?)
    `);
    stmt.run(rowid, JSON.stringify(embedding));
  }

  close() {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }
}