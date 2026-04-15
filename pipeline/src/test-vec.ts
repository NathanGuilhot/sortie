import { DatabaseManager } from './lib/db.js';

async function test() {
  const db = new DatabaseManager(':memory:');
  console.log('Database created, extension should be loaded');
  
  // Try inserting an embedding
  const embedding = new Array(512).fill(0.1);
  try {
    // First insert an image to get an ID
    // Actually we need an image row to link, but we can just use rowid 1
    db.insertEmbedding(1, embedding);
    console.log('insertEmbedding succeeded');
  } catch (err) {
    console.error('insertEmbedding failed:', (err as any).message);
    process.exit(1);
  }
  
  // Retrieve embedding
  const rows = db.getDatabase().prepare('SELECT rowid, embedding FROM vec_images').all();
  console.log('Retrieved rows:', rows.length);
  
  db.close();
}

test().catch(console.error);