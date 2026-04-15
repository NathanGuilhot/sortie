const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);
db.exec('CREATE VIRTUAL TABLE vec_test USING vec0(embedding float[512])');

// Insert with JSON string
const embedding = new Array(512).fill(0.1);
const json = JSON.stringify(embedding);
console.log('Inserting JSON length:', json.length);
db.exec(`INSERT INTO vec_test (rowid, embedding) VALUES (1, '${json}')`);

// Retrieve raw embedding
const row = db.prepare('SELECT rowid, embedding, typeof(embedding) as type FROM vec_test').get();
console.log('Row:', row);
console.log('Embedding type:', row.type);
console.log('Embedding first 100 chars:', row.embedding?.toString().substring(0, 100));
// Try to parse JSON
try {
    const parsed = JSON.parse(row.embedding);
    console.log('Parsed successfully, length:', parsed.length);
} catch (err) {
    console.error('Parse error:', err.message);
    // Show hex dump of first 50 bytes
    const buf = Buffer.from(row.embedding);
    console.log('Hex:', buf.toString('hex').substring(0, 100));
}

db.close();