import Database from 'better-sqlite3';
import { Image } from 'shared';

interface EmbeddingDbRow {
  rowid: number;
  embedding: Buffer | string | number[];
}

interface TagDbRow {
  id: number;
  name: string;
  category: string;
  color: string;
  created_at: string;
}

interface DismissedDbRow {
  image_id: number;
  tag_id: number;
  dismissed_at: string;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.setupExtensions();
    this.setupSchema();
    this.runMigrations();
  }

  private setupPragmas() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  private setupExtensions() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      const { load } = require('sqlite-vec');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      load(this.db);
    } catch (err) {
      console.warn('sqlite-vec extension not available:', err);
    }
  }

  private setupSchema() {
    this.db.exec(`SELECT vec_version()`);

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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT,
        color TEXT DEFAULT '#6B7280',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(
        embedding float[512]
      )
    `);

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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cluster_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collection_images (
        collection_id INTEGER NOT NULL,
        image_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection_id, image_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
      )
    `);

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
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_image ON dismissed_suggestions(image_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_tag ON dismissed_suggestions(tag_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_image_tags_source ON image_tags(source)
    `);
  }

  private runMigrations() {
    const version = this.db.pragma('user_version', { simple: true }) as number;

    if (version < 2) {
      const columns = this.db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
      const colNames = new Set(columns.map((c) => c.name));

      if (!colNames.has('file_hash')) {
        this.db.exec('ALTER TABLE images ADD COLUMN file_hash TEXT');
      }
      if (!colNames.has('dhash')) {
        this.db.exec('ALTER TABLE images ADD COLUMN dhash TEXT');
      }

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_file_hash ON images(file_hash)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_dhash ON images(dhash)');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS dismissed_duplicates (
          image_id_1 INTEGER NOT NULL,
          image_id_2 INTEGER NOT NULL,
          dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (image_id_1, image_id_2),
          FOREIGN KEY (image_id_1) REFERENCES images(id) ON DELETE CASCADE,
          FOREIGN KEY (image_id_2) REFERENCES images(id) ON DELETE CASCADE
        )
      `);

      this.db.pragma('user_version = 2');
    }

    if (version < 3) {
      const columns = this.db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
      const colNames = new Set(columns.map((c) => c.name));

      if (!colNames.has('camera_make')) {
        this.db.exec('ALTER TABLE images ADD COLUMN camera_make TEXT');
      }
      if (!colNames.has('camera_model')) {
        this.db.exec('ALTER TABLE images ADD COLUMN camera_model TEXT');
      }
      if (!colNames.has('aperture')) {
        this.db.exec('ALTER TABLE images ADD COLUMN aperture REAL');
      }
      if (!colNames.has('iso')) {
        this.db.exec('ALTER TABLE images ADD COLUMN iso INTEGER');
      }
      if (!colNames.has('exposure_time')) {
        this.db.exec('ALTER TABLE images ADD COLUMN exposure_time TEXT');
      }
      if (!colNames.has('focal_length')) {
        this.db.exec('ALTER TABLE images ADD COLUMN focal_length REAL');
      }

      this.db.pragma('user_version = 3');
    }
  }

  insertImage(image: Omit<Image, 'id' | 'created_at' | 'modified_at'>): number {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO images (
        file_path, file_name, file_size, mime_type, width, height,
        captured_at, latitude, longitude, city, country, description,
        favorite, hidden, file_hash, dhash,
        camera_make, camera_model, aperture, iso, exposure_time, focal_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      image.hidden ? 1 : 0,
      image.file_hash ?? null,
      image.dhash ?? null,
      image.camera_make ?? null,
      image.camera_model ?? null,
      image.aperture ?? null,
      image.iso ?? null,
      image.exposure_time ?? null,
      image.focal_length ?? null,
    );
    return result.lastInsertRowid as number;
  }

  insertEmbedding(rowid: number, embedding: number[]) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vec_images (rowid, embedding) VALUES (?, ?)
    `);
    stmt.run(BigInt(rowid), new Float32Array(embedding));
  }

  close() {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  getAllEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    const rows = this.db
      .prepare('SELECT rowid, embedding FROM vec_images')
      .all() as EmbeddingDbRow[];
    return rows.map((row) => {
      let embedding: number[];
      if (Buffer.isBuffer(row.embedding)) {
        const floatArray = new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / 4,
        );
        embedding = Array.from(floatArray);
      } else if (typeof row.embedding === 'string') {
        embedding = JSON.parse(row.embedding) as number[];
      } else {
        embedding = row.embedding;
      }
      return { rowid: row.rowid, embedding };
    });
  }

  getImageTags(imageId: number): TagDbRow[] {
    return this.db
      .prepare(
        `
      SELECT t.* FROM tags t
      JOIN image_tags it ON t.id = it.tag_id
      WHERE it.image_id = ?
    `,
      )
      .all(imageId) as TagDbRow[];
  }

  getDismissedSuggestions(imageId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE image_id = ?')
      .all(imageId) as DismissedDbRow[];
  }

  dismissSuggestion(imageId: number, tagId: number): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO dismissed_suggestions (image_id, tag_id)
      VALUES (?, ?)
    `,
      )
      .run(imageId, tagId);
  }

  getAllTags(): TagDbRow[] {
    return this.db.prepare('SELECT * FROM tags').all() as TagDbRow[];
  }
}
