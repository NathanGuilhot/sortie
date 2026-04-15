const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);
db.exec('DROP TABLE IF EXISTS vec_test');
db.exec('CREATE VIRTUAL TABLE vec_test USING vec0(embedding float[2])');

function testInsert(desc, rowid, embedding) {
    console.log(`\\n${desc}`);
    try {
        const stmt = db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (?, ?)');
        stmt.run(rowid, embedding);
        console.log('Success');
    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
}

// Test different rowid bindings
const embedding = JSON.stringify([0.1, 0.2]);
testInsert('rowid as integer 5', 5, embedding);
testInsert('rowid as number 6.0', 6.0, embedding);
testInsert('rowid as string "7"', "7", embedding);
testInsert('rowid as BigInt 8', BigInt(8), embedding);
testInsert('rowid as integer 0', 0, embedding);
testInsert('rowid as integer -1', -1, embedding);
testInsert('rowid as null', null, embedding);
testInsert('rowid as undefined', undefined, embedding);

// Test with binding object (named parameters?)
console.log('\\nNamed parameters');
try {
    const stmt = db.prepare('INSERT INTO vec_test (rowid, embedding) VALUES (@rowid, @embedding)');
    stmt.run({ '@rowid': 9, '@embedding': embedding });
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Test with raw SQL concatenation (should work)
console.log('\\nRaw SQL concatenation');
try {
    db.exec(`INSERT INTO vec_test (rowid, embedding) VALUES (10, '${embedding}')`);
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}

// Check rows
const rows = db.prepare('SELECT rowid, embedding FROM vec_test').all();
console.log(`\\nTotal rows: ${rows.length}`);
rows.forEach(r => console.log(`rowid ${r.rowid}`));

db.close();