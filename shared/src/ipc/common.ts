export interface SortieProgress {
  current: number;
  total: number;
  currentFile: string;
  processed?: number;
  skipped?: number;
}

export interface FolderAvailabilityChange {
  path: string;
  available: boolean;
  writable: boolean;
}

export interface SuggestDefaultPhotoFolderResult {
  path: string;
  exists: boolean;
  approxImageCount: number | null;
  capped: boolean;
}

export interface SortieImageMetadataUpdate {
  description?: string;
  favorite?: boolean;
  captured_at?: string | null;
  city?: string | null;
  country?: string | null;
  website_link?: string | null;
}
