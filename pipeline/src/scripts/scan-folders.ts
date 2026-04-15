#!/usr/bin/env node

import { DatabaseManager } from '../lib/db';

export async function scanFolders(dbPath: string, folderPaths: string[]) {
  console.log('Scanning folders:', folderPaths);
  // TODO: implement folder scanning with chokidar
}