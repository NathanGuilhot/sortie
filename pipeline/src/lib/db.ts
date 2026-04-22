import Database from 'better-sqlite3';
import path from 'path';
import { Image, Face, Person, PaletteColor, FACE_EMBEDDING_DIM, normalizeVector } from 'shared';

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

interface VecMatchRow {
  rowid: number;
  distance: number;
}

export class DatabaseManager {
  private db: Database.Database;
  private vecLoaded = false;

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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getLoadablePath } = require('sqlite-vec') as { getLoadablePath: () => string };
      let extPath = getLoadablePath();
      // In packaged Electron apps, sqlite-vec resolves to a path inside
      // app.asar but the .dylib lives in app.asar.unpacked (per electron-builder
      // asarUnpack rules). Redirect so sqlite3_load_extension can dlopen it.
      extPath = extPath.replace(
        `${path.sep}app.asar${path.sep}`,
        `${path.sep}app.asar.unpacked${path.sep}`,
      );
      this.db.loadExtension(extPath);
      this.vecLoaded = true;
    } catch (err) {
      console.warn('sqlite-vec extension not available:', err);
    }
  }

  private setupSchema() {
    if (this.vecLoaded) {
      this.db.exec(`SELECT vec_version()`);
    }

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
        position INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (image_id, tag_id),
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    if (this.vecLoaded) {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(
          embedding float[512]
        )
      `);
    }

    this.db.exec(`
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
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

    if (version < 4) {
      const columns = this.db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
      const colNames = new Set(columns.map((c) => c.name));

      if (!colNames.has('faces_scanned')) {
        this.db.exec('ALTER TABLE images ADD COLUMN faces_scanned BOOLEAN DEFAULT 0');
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS persons (
          id INTEGER PRIMARY KEY,
          name TEXT,
          thumbnail_face_id INTEGER,
          face_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.exec(`
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

      if (this.vecLoaded) {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_faces USING vec0(
            embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
          )
        `);

        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_persons USING vec0(
            embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
          )
        `);
      }

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_faces_image ON faces(image_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)');

      this.db.pragma('user_version = 5');
    }

    if (version >= 4 && version < 5 && this.vecLoaded) {
      // Vec tables were created with default (L2) distance. Recreate with cosine
      // and wipe all persons so clustering is re-run on next scan.
      this.db.exec('DROP TABLE IF EXISTS vec_faces');
      this.db.exec('DROP TABLE IF EXISTS vec_persons');
      this.db.exec(`
        CREATE VIRTUAL TABLE vec_faces USING vec0(
          embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
        )
      `);
      this.db.exec(`
        CREATE VIRTUAL TABLE vec_persons USING vec0(
          embedding float[${FACE_EMBEDDING_DIM}] distance_metric=cosine
        )
      `);
      this.db.exec('DELETE FROM faces');
      this.db.exec('DELETE FROM persons');
      this.db.exec('UPDATE images SET faces_scanned = 0');
      this.db.pragma('user_version = 5');
    }

    if (version < 6) {
      const folderCols = this.db.prepare('PRAGMA table_info(folders)').all() as Array<{
        name: string;
      }>;
      const folderColNames = new Set(folderCols.map((c) => c.name));
      if (!folderColNames.has('available')) {
        this.db.exec('ALTER TABLE folders ADD COLUMN available BOOLEAN DEFAULT 1');
      }

      const imageCols = this.db.prepare('PRAGMA table_info(images)').all() as Array<{
        name: string;
      }>;
      const imageColNames = new Set(imageCols.map((c) => c.name));
      if (!imageColNames.has('missing')) {
        this.db.exec('ALTER TABLE images ADD COLUMN missing BOOLEAN DEFAULT 0');
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_missing ON images(missing)');

      this.db.pragma('user_version = 6');
    }

    if (version < 7) {
      const imageCols = this.db.prepare('PRAGMA table_info(images)').all() as Array<{
        name: string;
      }>;
      const imageColNames = new Set(imageCols.map((c) => c.name));
      if (!imageColNames.has('website_link')) {
        this.db.exec('ALTER TABLE images ADD COLUMN website_link TEXT');
      }

      this.db.exec(`
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

      this.db.pragma('user_version = 7');
    }

    if (version < 8) {
      const folderCols = this.db.prepare('PRAGMA table_info(folders)').all() as Array<{
        name: string;
      }>;
      const folderColNames = new Set(folderCols.map((c) => c.name));
      if (!folderColNames.has('exclude_from_face_scan')) {
        this.db.exec('ALTER TABLE folders ADD COLUMN exclude_from_face_scan BOOLEAN DEFAULT 0');
      }
      this.db.pragma('user_version = 8');
    }

    if (version < 9) {
      const imageTagCols = this.db.prepare('PRAGMA table_info(image_tags)').all() as Array<{
        name: string;
      }>;
      const imageTagColNames = new Set(imageTagCols.map((c) => c.name));
      if (!imageTagColNames.has('position')) {
        this.db.exec('ALTER TABLE image_tags ADD COLUMN position INTEGER');
      }
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_image_tags_position ON image_tags(tag_id, position)',
      );
      this.db.pragma('user_version = 9');
    }

    if (version < 10) {
      const folderCols = this.db.prepare('PRAGMA table_info(folders)').all() as Array<{
        name: string;
      }>;
      const folderColNames = new Set(folderCols.map((c) => c.name));
      if (!folderColNames.has('writable')) {
        this.db.exec('ALTER TABLE folders ADD COLUMN writable BOOLEAN DEFAULT 1');
      }
      this.db.pragma('user_version = 10');
    }

    if (version < 11) {
      const imageCols = this.db.prepare('PRAGMA table_info(images)').all() as Array<{
        name: string;
      }>;
      const imageColNames = new Set(imageCols.map((c) => c.name));
      if (!imageColNames.has('palette_json')) {
        this.db.exec('ALTER TABLE images ADD COLUMN palette_json TEXT');
      }

      // Regular table holds per-color metadata (image_id, slot, weight) and
      // owns the autoincrement id used as the vec_palette rowid. Mirrors the
      // faces + vec_faces split.
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS palette_colors (
          id INTEGER PRIMARY KEY,
          image_id INTEGER NOT NULL,
          color_idx INTEGER NOT NULL,
          weight REAL NOT NULL,
          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        )
      `);
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_palette_colors_image ON palette_colors(image_id)',
      );

      if (this.vecLoaded) {
        // Default L2 on Lab approximates Delta E 76; lightness magnitude matters here.
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_palette USING vec0(
            lab float[3]
          )
        `);
      }

      this.db.pragma('user_version = 11');
    }

    if (version < 12) {
      // Palette space switched from CIELAB to OKLab. Stored vectors and query
      // vectors must share a space or nearest-neighbor search is garbage, so
      // wipe existing palette data — `getImagesMissingPalette` will surface
      // these for recomputation.
      if (this.vecLoaded) {
        this.db.exec('DELETE FROM vec_palette');
      }
      this.db.exec('DELETE FROM palette_colors');
      this.db.exec('UPDATE images SET palette_json = NULL');

      this.db.pragma('user_version = 12');
    }

    if (version < 13) {
      this.db.exec('DROP TABLE IF EXISTS metadata_changes');
      this.db.pragma('user_version = 13');
    }

    if (version < 14) {
      const imageCols = this.db.prepare('PRAGMA table_info(images)').all() as Array<{
        name: string;
      }>;
      const imageColNames = new Set(imageCols.map((c) => c.name));
      if (!imageColNames.has('ocr_status')) {
        this.db.exec('ALTER TABLE images ADD COLUMN ocr_status TEXT');
      }
      if (!imageColNames.has('ocr_at')) {
        this.db.exec('ALTER TABLE images ADD COLUMN ocr_at INTEGER');
      }

      // block_index: ordering within an image (top-to-bottom, left-to-right).
      // polygon_json: four corner points for rotated text. Plain bbox is the
      //   axis-aligned enclosing rectangle for quick overlay/hit-testing.
      this.db.exec(`
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
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_image_ocr_image ON image_ocr(image_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_ocr_status ON images(ocr_status)');

      this.db.pragma('user_version = 14');
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
    // vec0 tables don't support REPLACE; delete then insert.
    this.db.prepare('DELETE FROM vec_images WHERE rowid = ?').run(BigInt(rowid));
    this.db
      .prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(rowid), new Float32Array(embedding));
  }

  insertPalette(imageId: number, palette: PaletteColor[]): void {
    const txn = this.db.transaction((pal: PaletteColor[]) => {
      // Clear any previous palette for this image.
      const oldIds = this.db
        .prepare('SELECT id FROM palette_colors WHERE image_id = ?')
        .all(imageId) as Array<{ id: number }>;
      if (this.vecLoaded) {
        const delVec = this.db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        for (const { id } of oldIds) {
          delVec.run(BigInt(id));
        }
      }
      this.db.prepare('DELETE FROM palette_colors WHERE image_id = ?').run(imageId);

      const insertMeta = this.db.prepare(
        'INSERT INTO palette_colors (image_id, color_idx, weight) VALUES (?, ?, ?)',
      );
      const insertVec = this.vecLoaded
        ? this.db.prepare('INSERT INTO vec_palette (rowid, lab) VALUES (?, ?)')
        : null;

      for (let i = 0; i < pal.length; i++) {
        const color = pal[i];
        const result = insertMeta.run(imageId, i, color.weight);
        const rowid = result.lastInsertRowid as number;
        if (insertVec) {
          insertVec.run(BigInt(rowid), new Float32Array(color.lab));
        }
      }

      this.db
        .prepare('UPDATE images SET palette_json = ? WHERE id = ?')
        .run(JSON.stringify(pal), imageId);
    });
    txn(palette);
  }

  getPalette(imageId: number): PaletteColor[] | null {
    const row = this.db.prepare('SELECT palette_json FROM images WHERE id = ?').get(imageId) as
      | { palette_json: string | null }
      | undefined;
    if (!row?.palette_json) return null;
    try {
      return JSON.parse(row.palette_json) as PaletteColor[];
    } catch {
      return null;
    }
  }

  getImagesMissingPalette(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM images
         WHERE palette_json IS NULL AND hidden = 0 AND missing = 0`,
      )
      .all() as Array<{ id: number; file_path: string }>;
  }

  /**
   * Given a set of query colors in Lab space, return the N nearest images.
   * For each image, we take the minimum distance to any of its palette
   * colors per query, then aggregate per image by summing those minima
   * (so "red + blue" favors images that contain both red AND blue).
   */
  findImagesByColors(
    queryLabs: Array<[number, number, number]>,
    limit: number,
  ): Array<{ imageId: number; score: number }> {
    if (!this.vecLoaded || queryLabs.length === 0) return [];

    // Oversample per query to give the aggregator enough candidates.
    const perQueryK = Math.max(200, limit * 10);

    const perImageMin = new Map<number, number[]>();
    const queryDist = this.db.prepare(`
      SELECT v.rowid, v.distance, pc.image_id
      FROM vec_palette v
      JOIN palette_colors pc ON pc.id = v.rowid
      JOIN images i ON i.id = pc.image_id
      WHERE v.lab MATCH ? AND k = ? AND i.hidden = 0 AND i.missing = 0
      ORDER BY v.distance
    `);

    for (let qi = 0; qi < queryLabs.length; qi++) {
      const rows = queryDist.all(new Float32Array(queryLabs[qi]), perQueryK) as Array<{
        rowid: number;
        distance: number;
        image_id: number;
      }>;

      const seen = new Set<number>();
      for (const r of rows) {
        if (seen.has(r.image_id)) continue;
        seen.add(r.image_id);
        let arr = perImageMin.get(r.image_id);
        if (!arr) {
          arr = new Array(queryLabs.length).fill(Infinity);
          perImageMin.set(r.image_id, arr);
        }
        arr[qi] = r.distance;
      }
    }

    const aggregated: Array<{ imageId: number; score: number }> = [];
    for (const [imageId, dists] of perImageMin) {
      // Only keep images that matched every requested color (otherwise
      // searching for red + blue returns images with only red).
      let score = 0;
      let complete = true;
      for (const d of dists) {
        if (!Number.isFinite(d)) {
          complete = false;
          break;
        }
        score += d;
      }
      if (complete) aggregated.push({ imageId, score });
    }
    aggregated.sort((a, b) => a.score - b.score);
    return aggregated.slice(0, limit);
  }

  close() {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(key, value);
  }

  getAllEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return this.decodeEmbeddingRows(
      this.db.prepare('SELECT rowid, embedding FROM vec_images').all() as EmbeddingDbRow[],
    );
  }

  getVisibleEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return this.decodeEmbeddingRows(
      this.db
        .prepare(
          `SELECT v.rowid AS rowid, v.embedding AS embedding
           FROM vec_images v
           JOIN images img ON img.id = v.rowid
           WHERE img.hidden = 0 AND img.missing = 0`,
        )
        .all() as EmbeddingDbRow[],
    );
  }

  private decodeEmbeddingRows(
    rows: EmbeddingDbRow[],
  ): Array<{ rowid: number; embedding: number[] }> {
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

  getDismissedSuggestionsByTag(tagId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE tag_id = ?')
      .all(tagId) as DismissedDbRow[];
  }

  getBoardImageIds(tagId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT it.image_id AS image_id
         FROM image_tags it
         INNER JOIN images img ON img.id = it.image_id
         WHERE it.tag_id = ? AND img.hidden = 0 AND img.missing = 0`,
      )
      .all(tagId) as Array<{ image_id: number }>;
    return rows.map((r) => r.image_id);
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

  getTagsWithCounts(): Array<TagDbRow & { usage_count: number }> {
    return this.db
      .prepare(
        `
      SELECT t.*, COUNT(it.image_id) AS usage_count
      FROM tags t
      LEFT JOIN image_tags it ON t.id = it.tag_id
      GROUP BY t.id
      ORDER BY usage_count DESC
    `,
      )
      .all() as Array<TagDbRow & { usage_count: number }>;
  }

  // --- Face / Person methods ---

  insertFace(face: {
    image_id: number;
    person_id: number | null;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    confidence: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO faces (image_id, person_id, bbox_x, bbox_y, bbox_w, bbox_h, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      face.image_id,
      face.person_id,
      face.bbox_x,
      face.bbox_y,
      face.bbox_w,
      face.bbox_h,
      face.confidence,
    );
    return result.lastInsertRowid as number;
  }

  insertFaceEmbedding(faceRowid: number, embedding: number[]): void {
    this.db
      .prepare('INSERT OR REPLACE INTO vec_faces (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(faceRowid), new Float32Array(normalizeVector(embedding)));
  }

  getFaceEmbedding(faceId: number): number[] | null {
    const row = this.db
      .prepare('SELECT embedding FROM vec_faces WHERE rowid = ?')
      .get(BigInt(faceId)) as { embedding: Buffer | number[] } | undefined;
    if (!row) return null;
    if (Buffer.isBuffer(row.embedding)) {
      return Array.from(
        new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / 4,
        ),
      );
    }
    return row.embedding;
  }

  insertPerson(name?: string | null): number {
    const stmt = this.db.prepare('INSERT INTO persons (name) VALUES (?)');
    const result = stmt.run(name ?? null);
    return result.lastInsertRowid as number;
  }

  insertPersonEmbedding(personRowid: number, embedding: number[]): void {
    // vec0 virtual tables don't support REPLACE — delete first, then insert.
    this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?').run(BigInt(personRowid));
    this.db
      .prepare('INSERT INTO vec_persons (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(personRowid), new Float32Array(normalizeVector(embedding)));
  }

  findNearestPerson(embedding: number[], limit: number = 1): VecMatchRow[] {
    const stmt = this.db.prepare(`
      SELECT rowid, distance FROM vec_persons
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `);
    return stmt.all(new Float32Array(embedding), limit) as VecMatchRow[];
  }

  getAllPersons(): Person[] {
    return this.db
      .prepare('SELECT * FROM persons WHERE face_count > 0 ORDER BY face_count DESC')
      .all() as Person[];
  }

  getPersonById(personId: number): Person | null {
    return (
      (this.db.prepare('SELECT * FROM persons WHERE id = ?').get(personId) as Person | undefined) ??
      null
    );
  }

  getImageFaces(imageId: number): Face[] {
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         LEFT JOIN persons p ON f.person_id = p.id
         LEFT JOIN images i ON f.image_id = i.id
         WHERE f.image_id = ?`,
      )
      .all(imageId) as Face[];
  }

  getPersonFaces(personId: number): Face[] {
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         LEFT JOIN persons p ON f.person_id = p.id
         LEFT JOIN images i ON f.image_id = i.id
         WHERE f.person_id = ?`,
      )
      .all(personId) as Face[];
  }

  updateFacePerson(faceId: number, personId: number | null): void {
    this.db.prepare('UPDATE faces SET person_id = ? WHERE id = ?').run(personId, faceId);
  }

  updatePersonName(personId: number, name: string): void {
    this.db
      .prepare("UPDATE persons SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name, personId);
  }

  updatePersonThumbnail(personId: number, faceId: number): void {
    this.db
      .prepare(
        "UPDATE persons SET thumbnail_face_id = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(faceId, personId);
  }

  updatePersonFaceCount(personId: number): void {
    this.db
      .prepare(
        `UPDATE persons SET
           face_count = (SELECT COUNT(*) FROM faces WHERE person_id = ?),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(personId, personId);
  }

  deletePerson(personId: number): void {
    this.db.prepare('UPDATE faces SET person_id = NULL WHERE person_id = ?').run(personId);
    if (this.vecLoaded) {
      this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?').run(BigInt(personId));
    }
    this.db.prepare('DELETE FROM persons WHERE id = ?').run(personId);
  }

  markImageFacesScanned(imageId: number): void {
    this.db.prepare('UPDATE images SET faces_scanned = 1 WHERE id = ?').run(imageId);
  }

  getUnscannedFaceImages(): Array<{ id: number; file_path: string }> {
    const excluded = this.db
      .prepare('SELECT path FROM folders WHERE exclude_from_face_scan = 1')
      .all() as Array<{ path: string }>;
    if (excluded.length === 0) {
      return this.db
        .prepare('SELECT id, file_path FROM images WHERE faces_scanned = 0 AND hidden = 0')
        .all() as Array<{ id: number; file_path: string }>;
    }
    const likeClauses = excluded.map(() => "file_path NOT LIKE ? || '/%'").join(' AND ');
    const stmt = this.db.prepare(
      `SELECT id, file_path FROM images
       WHERE faces_scanned = 0 AND hidden = 0 AND ${likeClauses}`,
    );
    return stmt.all(...excluded.map((e) => e.path)) as Array<{ id: number; file_path: string }>;
  }

  // --- OCR methods ---

  getImagePath(imageId: number): string | null {
    const row = this.db
      .prepare('SELECT file_path FROM images WHERE id = ?')
      .get(imageId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  getOcrStatus(imageId: number): { status: string | null; at: number | null } {
    const row = this.db
      .prepare('SELECT ocr_status AS status, ocr_at AS at FROM images WHERE id = ?')
      .get(imageId) as { status: string | null; at: number | null } | undefined;
    return row ?? { status: null, at: null };
  }

  getImageOcr(imageId: number): Array<{
    block_index: number;
    text: string;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    polygon_json: string | null;
    confidence: number;
  }> {
    return this.db
      .prepare(
        `SELECT block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence
         FROM image_ocr
         WHERE image_id = ?
         ORDER BY block_index`,
      )
      .all(imageId) as Array<{
      block_index: number;
      text: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      polygon_json: string | null;
      confidence: number;
    }>;
  }

  saveImageOcr(
    imageId: number,
    blocks: Array<{
      text: string;
      bbox: { x: number; y: number; width: number; height: number };
      polygon?: [[number, number], [number, number], [number, number], [number, number]];
      confidence: number;
    }>,
  ): void {
    const now = Date.now();
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM image_ocr WHERE image_id = ?').run(imageId);
      const insert = this.db.prepare(
        `INSERT INTO image_ocr
           (image_id, block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        insert.run(
          imageId,
          i,
          b.text,
          b.bbox.x,
          b.bbox.y,
          b.bbox.width,
          b.bbox.height,
          b.polygon ? JSON.stringify(b.polygon) : null,
          b.confidence,
        );
      }
      this.db
        .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
        .run(blocks.length === 0 ? 'empty' : 'done', now, imageId);
    });
    txn();
  }

  markOcrError(imageId: number, message: string): void {
    // Truncate to avoid storing multi-kilobyte stack traces as status rows.
    const short = message.length > 200 ? message.slice(0, 200) : message;
    this.db
      .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
      .run(`error:${short}`, Date.now(), imageId);
  }

  cleanupOrphanedPersons(): void {
    const orphans = this.db
      .prepare(
        `SELECT id FROM persons
         WHERE id NOT IN (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)`,
      )
      .all() as Array<{ id: number }>;
    const delVec = this.vecLoaded
      ? this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?')
      : null;
    const delPerson = this.db.prepare('DELETE FROM persons WHERE id = ?');
    for (const { id } of orphans) {
      delVec?.run(BigInt(id));
      delPerson.run(id);
    }
  }
}
