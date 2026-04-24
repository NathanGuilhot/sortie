import type Database from 'better-sqlite3';
import { normalizeVector, type Face, type Person } from 'shared';
import { decodeEmbeddingValue } from './embedding';

export interface VecMatchRow {
  rowid: number;
  distance: number;
}

export class DatabasePeopleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly vecLoaded: boolean,
  ) {}

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
    return decodeEmbeddingValue(row.embedding);
  }

  insertPerson(name?: string | null): number {
    const result = this.db.prepare('INSERT INTO persons (name) VALUES (?)').run(name ?? null);
    return result.lastInsertRowid as number;
  }

  insertPersonEmbedding(personRowid: number, embedding: number[]): void {
    this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?').run(BigInt(personRowid));
    this.db
      .prepare('INSERT INTO vec_persons (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(personRowid), new Float32Array(normalizeVector(embedding)));
  }

  findNearestPerson(embedding: number[], limit: number = 1): VecMatchRow[] {
    return this.db
      .prepare(
        `SELECT rowid, distance FROM vec_persons
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(new Float32Array(embedding), limit) as VecMatchRow[];
  }

  getAllPersons(): Person[] {
    return this.db
      .prepare('SELECT * FROM persons WHERE face_count > 0 ORDER BY face_count DESC')
      .all() as Person[];
  }

  getPersonImageIds(personId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT i.id AS id
         FROM images i
         JOIN faces f ON f.image_id = i.id
         WHERE f.person_id = ? AND i.hidden = 0 AND i.missing = 0`,
      )
      .all(personId) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getThumbnailFacesForPersons(personIds: number[]): Face[] {
    if (personIds.length === 0) return [];
    const placeholders = personIds.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         JOIN persons p ON p.thumbnail_face_id = f.id
         JOIN images i ON i.id = f.image_id
         WHERE p.id IN (${placeholders})`,
      )
      .all(...personIds) as Face[];
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

  getFacePersonId(faceId: number): number | null {
    const row = this.db.prepare('SELECT person_id FROM faces WHERE id = ?').get(faceId) as
      | { person_id: number | null }
      | undefined;
    return row?.person_id ?? null;
  }

  updatePersonName(personId: number, name: string): void {
    this.db
      .prepare("UPDATE persons SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name, personId);
  }

  updatePersonThumbnail(personId: number, faceId: number): void {
    this.db
      .prepare("UPDATE persons SET thumbnail_face_id = ?, updated_at = datetime('now') WHERE id = ?")
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
    return this.db
      .prepare(
        `SELECT id, file_path FROM images
         WHERE faces_scanned = 0 AND hidden = 0 AND ${likeClauses}`,
      )
      .all(...excluded.map((entry) => entry.path)) as Array<{ id: number; file_path: string }>;
  }

  cleanupOrphanedPersons(): void {
    const orphans = this.db
      .prepare(
        `SELECT id FROM persons
         WHERE id NOT IN (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)`,
      )
      .all() as Array<{ id: number }>;
    const deleteVector = this.vecLoaded
      ? this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?')
      : null;
    const deletePerson = this.db.prepare('DELETE FROM persons WHERE id = ?');
    for (const { id } of orphans) {
      deleteVector?.run(BigInt(id));
      deletePerson.run(id);
    }
  }
}
