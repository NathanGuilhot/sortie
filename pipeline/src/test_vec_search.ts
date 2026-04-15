import { DatabaseManager } from './lib/db.js';

async function test() {
  const db = new DatabaseManager(':memory:');
  console.log('Database created');
  
  // Insert two embeddings with rowids 1 and 2
  const embedding1 = new Array(512).fill(0.1);
  const embedding2 = new Array(512).fill(0.9); // different vector
  try {
    db.insertEmbedding(1, embedding1);
    db.insertEmbedding(2, embedding2);
    console.log('Inserted two embeddings');
  } catch (err) {
    console.error('Insert failed:', err);
    db.close();
    return;
  }
  
  // Test retrieval
  const all = db.getAllEmbeddings();
  console.log(`Retrieved ${all.length} embeddings`);
  
  // Test similarity search using MATCH
  // Use embedding1 as query
  const queryEmbedding = embedding1;
  try {
    const results = db.getDatabase()
      .prepare(`
        SELECT rowid, distance
        FROM vec_images
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT 5
      `)
      .all(JSON.stringify(queryEmbedding)) as any[];
    console.log('Similarity search results:', results);
    // Expect rowid 1 with distance 0 (identical)
    if (results.length > 0 && results[0].rowid === 1 && results[0].distance === 0) {
      console.log('✓ Correct match found');
    } else {
      console.log('Unexpected results');
    }
  } catch (err) {
    console.error('Similarity search failed:', (err as any).message);
  }
  
  // Test vec_distance_cosine function
  try {
    const distance = db.getDatabase()
      .prepare('SELECT vec_distance_cosine(?, ?) as dist')
      .get(JSON.stringify(embedding1), JSON.stringify(embedding2));
    console.log('Cosine distance between embeddings:', distance);
  } catch (err) {
    console.error('vec_distance_cosine failed:', (err as any).message);
  }
  
  db.close();
  console.log('Test completed');
}

test().catch(console.error);