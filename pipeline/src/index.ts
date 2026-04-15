import 'dotenv/config';
import { DatabaseManager } from './lib/db';

export { DatabaseManager } from './lib/db';
export { ClipEmbedder } from './lib/clip';
export { extractExif } from './lib/exif';

export async function initializePipeline() {
  const dbPath = process.env.DATABASE_PATH || './sortie.db';
  const db = new DatabaseManager(dbPath);
  console.log('Pipeline initialized with database:', dbPath);
  return db;
}

if (require.main === module) {
  initializePipeline().then((db) => {
    console.log('Sortie pipeline ready');
    db.close();
  });
}