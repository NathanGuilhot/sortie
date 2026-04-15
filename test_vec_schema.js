const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);

// Create virtual table
db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(embedding float[512])');

// Get table info
const info = db.prepare('PRAGMA table_info(vec_images)').all();
console.log('Table info:', info);

// Get list of columns
const columns = info.map(row => row.name);
console.log('Columns:', columns);

// Try inserting with rowid as integer 1
try {
    const stmt = db.prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)');
    stmt.run(1, JSON.stringify(new Array(512).fill(0.1)));
    console.log('Insert succeeded');
} catch (err) {
    console.error('Insert error:', err.message);
}

// Try inserting without rowid (let SQLite assign)
try {
    const stmt2 = db.prepare('INSERT INTO vec_images (embedding) VALUES (?)');
    stmt2.run(JSON.stringify(new Array(512).fill(0.2)));
    console.log('Insert without rowid succeeded');
} catch (err) {
    console.error('Insert without rowid error:', err.message);
}

// Try selecting
const rows = db.prepare('SELECT rowid, embedding FROM vec_images').all();
console.log('Rows:', rows.length);

db.close();