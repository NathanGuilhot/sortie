import 'dotenv/config';

export { DatabaseManager } from './lib/db';
export { ClipEmbedder } from './lib/clip';
export { extractExif } from './lib/exif';
export { SuggestionEngine } from './lib/suggestions';
export { Organizer } from './lib/organizer';
export { computeFileHash } from './lib/dhash';
export { FaceDetector, DetectedFace } from './lib/face';
export { FaceMatcher, MatchResult } from './lib/face-matcher';
export { extractPalette, hexToOklab, hexToRgb, rgbToHex, PALETTE_SIZE } from './lib/palette';
export { isRawPath, loadImageInput, resolveImageInput, shutdownRawLoader } from './lib/raw';
export {
  createOcrEngine,
  PaddleOcrEngine,
  type OcrEngine,
  type OcrEngineOptions,
  type OcrBlock,
} from './lib/ocr';
export type { Collection, TagSuggestion } from 'shared';
