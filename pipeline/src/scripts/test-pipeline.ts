#!/usr/bin/env node

import { DatabaseManager } from '../lib/db.js';
import { ClipEmbedder } from '../lib/clip.js';
import { extractExif } from '../lib/exif.js';
import { join, dirname } from 'path';
import { statSync } from 'fs';
import { fileURLToPath } from 'url';

async function testPipeline() {
  console.log('=== Sortie Pipeline Test ===');

  // Define __dirname for ES modules
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 1. Create database with schema
  const dbPath = join(__dirname, '../../test/sortie-test.db');
  console.log(`Creating database at ${dbPath}`);
  const db = new DatabaseManager(dbPath);

  // Test sqlite-vec extension
  console.log('Testing sqlite-vec extension...');
  try {
    const result = db.getDatabase().prepare('SELECT vec_version()').get();
    console.log('sqlite-vec extension loaded successfully:', result);
  } catch (error) {
    console.warn('sqlite-vec extension not available:', (error as Error).message);
  }

  // 2. Process sample images
  const testImages = [
    join(__dirname, '../../test/test1.png'),
    join(__dirname, '../../test/test2.png'),
  ];

  // Check if test images exist
  for (const imagePath of testImages) {
    try {
      statSync(imagePath);
      console.log(`Found test image: ${imagePath}`);
    } catch {
      console.error(`Test image not found: ${imagePath}`);
      console.log('Please copy some test images to pipeline/test/ directory');
      return;
    }
  }

  // Initialize CLIP embedder
  console.log('Initializing CLIP embedder...');
  const clip = new ClipEmbedder();
  await clip.initialize();

  // Process each image
  for (const imagePath of testImages) {
    console.log(`\nProcessing image: ${imagePath}`);

    // 3. Extract EXIF
    console.log('Extracting EXIF metadata...');
    const exif = await extractExif(imagePath);
    console.log('EXIF data:', {
      capturedAt: exif.capturedAt,
      dimensions: `${exif.width}x${exif.height}`,
      camera: exif.cameraMake && exif.cameraModel ? `${exif.cameraMake} ${exif.cameraModel}` : null,
      gps: exif.latitude && exif.longitude ? `${exif.latitude}, ${exif.longitude}` : null,
    });

    // 4. Generate CLIP embedding
    console.log('Generating CLIP embedding...');
    const embedding = await clip.embedImage(imagePath);
    console.log(`Embedding generated: ${embedding.length} dimensions`);

    // Prepare image record
    const fileName = imagePath.split('/').pop() || '';
    const fileStats = statSync(imagePath);

    const imageRecord = {
      file_path: imagePath,
      file_name: fileName,
      file_size: fileStats.size,
      mime_type: 'image/png',
      width: exif.width,
      height: exif.height,
      captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null,
      latitude: exif.latitude,
      longitude: exif.longitude,
      city: null,
      country: null,
      description: null,
      favorite: false,
      hidden: false,
    };

    // 5. Store in SQLite
    console.log('Inserting image into database...');
    const imageId = db.insertImage(imageRecord);
    console.log(`Inserted image with ID: ${imageId}`);

    // Store embedding
    console.log('Storing embedding in vec_images table...');
    db.insertEmbedding(imageId, embedding);
    console.log('Embedding stored');
  }

  // 6. Perform similarity search query
  console.log('\n=== Testing similarity search ===');

  // Get all embeddings for search test
  const allEmbeddings = db.getAllEmbeddings();

  if (allEmbeddings.length >= 2) {
    console.log(`Found ${allEmbeddings.length} embeddings in database`);

    // Use the first embedding as query
    const queryEmbedding = allEmbeddings[0].embedding;

    // Perform similarity search using sqlite-vec
    console.log('Performing vector similarity search...');
    try {
      const searchResults = db
        .getDatabase()
        .prepare(
          `
          SELECT rowid, distance
          FROM vec_images
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 5
        `,
        )
        .all(JSON.stringify(queryEmbedding));

      console.log('Search results:', searchResults);

      // Also test with a text query
      console.log('\nTesting text-to-image search...');
      const textQuery = 'a screenshot';
      console.log(`Embedding text query: "${textQuery}"`);
      const textEmbedding = await clip.embedText(textQuery);

      const textSearchResults = db
        .getDatabase()
        .prepare(
          `
          SELECT rowid, distance
          FROM vec_images
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 5
        `,
        )
        .all(JSON.stringify(textEmbedding));

      console.log('Text search results:', textSearchResults);
    } catch (error) {
      console.error('Vector search failed:', (error as Error).message);
      console.log('This might be because sqlite-vec extension is not properly loaded');
    }
  } else {
    console.log('Need at least 2 embeddings for similarity search');
  }

  // Cleanup
  db.close();
  console.log('\n=== Test completed ===');
}

// ES module equivalent of require.main === module
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('test-pipeline')) {
  testPipeline().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export { testPipeline };
