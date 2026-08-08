import type Database from 'better-sqlite3';

// Authoritative "clear all face data". vec_face_clips must be included: its
// rowid mirrors faces.id, and sqlite reuses rowids, so a leftover clip
// embedding would match against a future unrelated face.
export function clearAllFaceData(db: Database.Database, vecLoaded: boolean): void {
  const txn = db.transaction(() => {
    if (vecLoaded) {
      db.exec('DELETE FROM vec_face_clips');
      db.exec('DELETE FROM vec_faces');
      db.exec('DELETE FROM vec_persons');
    }
    db.exec('DELETE FROM faces');
    db.exec('DELETE FROM persons');
    db.exec('UPDATE images SET faces_scanned = 0');
  });
  txn();
}
