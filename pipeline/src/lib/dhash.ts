import crypto from 'crypto';
import { createReadStream } from 'fs';

export async function computeFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
