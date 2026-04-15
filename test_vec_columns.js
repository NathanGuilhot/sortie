const Database = require('better-sqlite3');
const { load } = require('sqlite-vec');

const db = new Database(':memory:');
load(db);

function testCreate(definition) {
    console.log(`\\nTesting: ${definition}`);
    try {
        db.exec(`DROP TABLE IF EXISTS vec_test`);
        db.exec(`CREATE VIRTUAL TABLE vec_test USING ${definition}`);
        console.log('Created successfully');
        // Try insert without rowid
        db.exec(`INSERT INTO vec_test (embedding) VALUES ('[0.1,0.2]')`);
        console.log('Insert without rowid succeeded');
        // Try insert with rowid
        try {
            db.exec(`INSERT INTO vec_test (rowid, embedding) VALUES (5, '[0.3,0.4]')`);
            console.log('Insert with rowid succeeded');
        } catch (err) {
            console.log('Insert with rowid failed:', err.message);
        }
    } catch (err) {
        console.log('Error:', err.message);
    }
}

// Test different column definitions
testCreate('vec0(embedding float[2])');
testCreate('vec0(id INTEGER PRIMARY KEY, embedding float[2])');
testCreate('vec0(embedding float[2], id INTEGER)');
testCreate('vec0(embedding float[2]) WITHOUT ROWID'); // likely not supported

db.close();