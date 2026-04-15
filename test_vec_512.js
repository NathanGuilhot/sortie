const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);

console.log('Testing vec0 with float[512]');
db.exec('DROP TABLE IF EXISTS vec_test');
db.exec('CREATE VIRTUAL TABLE vec_test USING vec0(embedding float[512])');

// Insert without rowid
console.log('1. Insert without rowid');
try {
    db.exec(`INSERT INTO vec_test (embedding) VALUES ('${JSON.stringify(new Array(512).fill(0.1))}')`);
    console.log('Success, rowid:', db.prepare('SELECT last_insert_rowid()').get());
} catch (err) {
    console.error('Error:', err.message);
}

// Insert with rowid = 2
console.log('\\n2. Insert with rowid=2');
try {
    db.exec(`INSERT INTO vec_test (rowid, embedding) VALUES (2, '${JSON.stringify(new Array(512).fill(0.2))}')`);
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Insert with rowid = 3 using prepared statement
console.log('\\n3. Insert with rowid=3 using prepared statement');
try {
    const stmt = db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)');
    stmt.run(3, JSON.stringify(new Array(512).fill(0.3)));
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Count rows
const count = db.prepare('SELECT COUNT(*) as c FROM vec_test').get();
console.log('\\nTotal rows:', count.c);

db.close();