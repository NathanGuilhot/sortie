import 'dotenv/config';
import { DatabaseManager } from './lib/db';

export { DatabaseManager } from './lib/db';
export { ClipEmbedder } from './lib/clip';
export { extractExif } from './lib/exif';
export { SuggestionEngine, TagSuggestion } from './lib/suggestions';
export { Organizer, Collection } from './lib/organizer';
export {
  computeDHash,
  computeFileHash,
  hammingDistance,
  DHASH_DUPLICATE_THRESHOLD,
} from './lib/dhash';

export async function initializePipeline() {
  const dbPath = process.env.DATABASE_PATH || './sortie.db';
  return new DatabaseManager(dbPath);
}

if (require.main === module) {
  void initializePipeline().then((db) => {
    db.close();
  });
}
