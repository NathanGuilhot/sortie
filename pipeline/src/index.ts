import 'dotenv/config';

export { DatabaseManager } from './lib/db';
export { ClipEmbedder } from './lib/clip';
export { extractExif } from './lib/exif';
export { SuggestionEngine } from './lib/suggestions';
export { computeFileHash } from './lib/dhash';
export { FaceDetector } from './lib/face';
export { FaceMatcher } from './lib/face-matcher';
export { FaceScanService } from './lib/face-scan';
export { extractPalette, hexToOklab } from './lib/palette';
export { isRawPath, loadImageInput, shutdownRawLoader } from './lib/raw';
export { runWithConcurrency } from './lib/worker-pool';
export { createOcrEngine, type OcrEngine, type OcrEngineOptions, type OcrBlock } from './lib/ocr';
export type { TagSuggestion } from 'shared';
