#!/usr/bin/env node

import { DatabaseManager } from '../lib/db';
import { ClipEmbedder } from '../lib/clip';

export async function generateEmbeddings(dbPath: string, limit?: number) {
  console.log('Generating embeddings for images');
  // TODO: implement embedding generation
}