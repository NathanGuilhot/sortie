const { DatabaseManager } = require('./pipeline/dist/lib/db');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function test() {
  const dbPath = path.join(os.tmpdir(), 'sortie-test.db');
  console.log('Testing database at', dbPath);
  try {
    const db = new DatabaseManager(dbPath);
    console.log('DatabaseManager instantiated');
    // Try to get images (should be empty)
    const images = db.getDatabase().prepare('SELECT * FROM images LIMIT 5').all();
    console.log('Images:', images.length);
    db.close();
    fs.unlinkSync(dbPath);
    console.log('Test passed');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();