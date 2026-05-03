export const CLIP_EMBEDDING_DIM = 512;
export const CLIP_INPUT_SIZE = 224;

export const DEFAULT_TAG_COLOR = '#6B7280';

export const APP_SETTING_KEYS = {
  onboardingCompleted: 'onboarding.completed',
  onboardingHintSearch: 'onboarding.hints.search',
  onboardingHintWeb: 'onboarding.hints.web',
} as const;

export const FACE_DETECTION_MAX_DIM = 1024;
export const FACE_EMBEDDING_DIM = 128;
// Cosine distance on unit-norm FaceNet descriptors: 0 = identical, 2 = opposite.
// face-api's usual same-person threshold is L2 ~= 0.6. For normalized vectors:
// cosine distance = L2^2 / 2, so 0.6 maps to ~= 0.18.
export const FACE_MATCH_THRESHOLD = 0.18;
export const FACE_CLIP_MATCH_THRESHOLD = 0.18;
export const FACE_CLIP_CLUSTER_MAX_DISTANCE = 0.28;
export const FACE_PHOTOGRAPHIC_MIN_CLIP_MARGIN = 0;
export const FACE_MIN_CONFIDENCE = 0.75;
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
