export { DatabaseManager } from './lib/db';
export { ClipEmbedder } from './lib/clip';
export { extractExif } from './lib/exif';
export { SuggestionEngine } from './lib/suggestions';
export { computeFileHash } from './lib/dhash';
export { AnalysisWorker } from './lib/analysis-worker';
export {
  ANALYSIS_VERSION,
  sourceStamp,
  type FileAnalysis,
  type AnalyzedImage,
  type MatchedImages,
} from './lib/duplicate-analysis';
export type { CleanupMove } from './lib/db-duplicates';
export { extractPalette, hexToOklab } from './lib/palette';
export { isRawPath, loadImageInput, shutdownRawLoader } from './lib/raw';
export { sharp } from './lib/lazy-modules';
export { runWithConcurrency } from './lib/worker-pool';
export {
  classifyOrigin,
  createProvenanceReader,
  normalizeDomain,
  readFileEvidence,
  readImageOrigin,
  NO_EVIDENCE,
  type OriginInputs,
  type ProvenanceEvidence,
  type ProvenanceReader,
} from './lib/provenance';
export { createOcrEngine, type OcrEngine, type OcrEngineOptions, type OcrBlock } from './lib/ocr';
export { createTestDb, seedFolder, seedImage, type TestDb } from './lib/testing/test-db';
export type { TagSuggestion } from 'shared';
