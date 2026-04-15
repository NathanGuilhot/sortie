#!/usr/bin/env node
import { ClipEmbedder } from '../lib/clip.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testImage = join(__dirname, '../../test/test1.png');

async function testClip() {
  console.log('Testing CLIP embedder...');
  const clip = new ClipEmbedder();
  await clip.initialize();
  console.log('CLIP initialized');
  
  console.log('Embedding image...');
  const embedding = await clip.embedImage(testImage);
  console.log(`Embedding length: ${embedding.length}`);
  console.log('First 5 values:', embedding.slice(0, 5));
  
  console.log('Embedding text...');
  const textEmbedding = await clip.embedText('a photo of a cat');
  console.log(`Text embedding length: ${textEmbedding.length}`);
  console.log('First 5 values:', textEmbedding.slice(0, 5));
  
  // Ensure embeddings are normalized
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  console.log(`Image embedding norm: ${norm}`);
  const textNorm = Math.sqrt(textEmbedding.reduce((s, v) => s + v * v, 0));
  console.log(`Text embedding norm: ${textNorm}`);
}

testClip().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});