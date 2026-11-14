export const CLIP_EMBEDDING_DIM = 512;
export const CLIP_INPUT_SIZE = 224;

export const DEFAULT_TAG_COLOR = '#6B7280';

export const APP_SETTING_KEYS = {
  onboardingCompleted: 'onboarding.completed',
  onboardingHintSearch: 'onboarding.hints.search',
  onboardingHintWeb: 'onboarding.hints.web',
  imageEditingShowWarning: 'imageEditing.showWarning',
} as const;

export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.heic',
  // Camera RAW: decoded via embedded JPEG preview in pipeline/lib/raw.ts
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
