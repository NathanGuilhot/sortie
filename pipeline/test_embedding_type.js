const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database('sortie.db');
load(db);

const rows = db.prepare('SELECT rowid, embedding FROM vec_images LIMIT 1').all();
console.log('Number of rows:', rows.length);
if (rows.length > 0) {
  const row = rows[0];
  console.log('rowid:', row.rowid);
  console.log('embedding type:', typeof row.embedding);
  console.log('embedding constructor:', row.embedding?.constructor?.name);
  console.log('Is Buffer?', Buffer.isBuffer(row.embedding));
  console.log('Is string?', typeof row.embedding === 'string');
  if (Buffer.isBuffer(row.embedding)) {
    console.log('Buffer length:', row.embedding.length);
    console.log('First few bytes:', row.embedding.slice(0, 10));
    // Try to decode as Float32Array
    const floatArray = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    console.log('Float32Array length:', floatArray.length);
    console.log('First few floats:', floatArray.slice(0, 5));
  } else if (typeof row.embedding === 'string') {
    console.log('First 100 chars:', row.embedding.substring(0, 100));
    try {
      const parsed = JSON.parse(row.embedding);
      console.log('Parsed length:', parsed.length);
    } catch(e) {
      console.log('JSON parse error:', e.message);
    }
  }
}
db.close();