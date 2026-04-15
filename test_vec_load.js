const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

console.log('Testing sqlite-vec extension loading...');
const db = new Database(':memory:');

try {
    load(db);
    console.log('Extension loaded successfully');
} catch (err) {
    console.error('Load failed:', err.message);
    process.exit(1);
}

// Test vec_version
try {
    const result = db.prepare('SELECT vec_version()').get();
    console.log('vec_version:', result);
} catch (err) {
    console.error('vec_version failed:', err.message);
    process.exit(1);
}

// Create virtual table
try {
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS vec_images USING vec0(embedding float[512])');
    console.log('Virtual table created');
} catch (err) {
    console.error('Create virtual table failed:', err.message);
    process.exit(1);
}

// Insert a dummy embedding
const embedding = new Array(512).fill(0.1);
try {
    const stmt = db.prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)');
    stmt.run(1, JSON.stringify(embedding));
    console.log('Insert succeeded');
} catch (err) {
    console.error('Insert failed:', err.message);
    process.exit(1);
}

// Query
try {
    const rows = db.prepare('SELECT rowid, embedding FROM vec_images').all();
    console.log('Query succeeded, rows:', rows.length);
} catch (err) {
    console.error('Query failed:', err.message);
    process.exit(1);
}

console.log('All tests passed');
db.close();