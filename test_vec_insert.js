const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);

// Create virtual table
db.exec('CREATE VIRTUAL TABLE vec_test USING vec0(embedding float[512])');

// Get table xinfo (includes hidden columns)
const xinfo = db.prepare('PRAGMA table_xinfo(vec_test)').all();
console.log('Table xinfo:', JSON.stringify(xinfo, null, 2));

// Get database schema
const schema = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('vec_test');
console.log('Schema:', schema);

// Try inserting with rowid as integer 5
console.log('\\nTest 1: insert rowid=5, embedding as JSON array');
try {
    const stmt = db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)');
    stmt.run(5, JSON.stringify(new Array(512).fill(0.5)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Try inserting with rowid as integer 0
console.log('\\nTest 2: insert rowid=0');
try {
    db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)').run(0, JSON.stringify(new Array(512).fill(0.1)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Try inserting with rowid as real 6.0
console.log('\\nTest 3: insert rowid=6.0');
try {
    db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)').run(6.0, JSON.stringify(new Array(512).fill(0.2)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Try inserting with rowid as string "7"
console.log('\\nTest 4: insert rowid="7"');
try {
    db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)').run("7", JSON.stringify(new Array(512).fill(0.3)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Try inserting without rowid
console.log('\\nTest 5: insert without rowid');
try {
    db.prepare('INSERT INTO vec_test (embedding) VALUES (?)').run(JSON.stringify(new Array(512).fill(0.4)));
    console.log('Success, rowid assigned:', db.prepare('SELECT last_insert_rowid()').get());
} catch (err) {
    console.error('Error:', err.message);
}

// Try inserting with rowid after auto insert
console.log('\\nTest 6: insert rowid=10 after auto insert');
try {
    db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)').run(10, JSON.stringify(new Array(512).fill(0.6)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Check all rows
const rows = db.prepare('SELECT rowid, embedding FROM vec_test').all();
console.log('\\nTotal rows:', rows.length);
rows.forEach(row => console.log(`rowid=${row.rowid}, embedding length=${JSON.parse(row.embedding).length}`));

db.close();