export const CLIP_EMBEDDING_DIM = 512;
export const CLIP_INPUT_SIZE = 224;

export const DEFAULT_TAG_COLOR = '#6B7280';

export const FACE_DETECTION_MAX_DIM = 1024;
export const FACE_EMBEDDING_DIM = 128;
// Cosine distance on unit-norm FaceNet descriptors: 0 = identical, 2 = opposite.
// 0.4 ≈ cos_sim ≥ 0.6 — standard same-person threshold.
export const FACE_MATCH_THRESHOLD = 0.4;
export const FACE_MIN_CONFIDENCE = 0.6;
export const FACE_MIN_SIZE_RATIO = 0.02;

export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.heic',
  // Camera RAW — decoded via embedded JPEG preview in pipeline/lib/raw.ts
  '.cr2',
  '.cr3',
  '.crw',
  '.nef',
  '.nrw',
  '.arw',
  '.sr2',
  '.srf',
  '.raf',
  '.orf',
  '.rw2',
  '.pef',
  '.dng',
  '.raw',
];
