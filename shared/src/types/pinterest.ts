export interface PinterestResult {
  pinId: string;
  imageUrl: string;
  width: number;
  height: number;
  alt: string | null;
  description: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  pinUrl: string;
  // True when Pinterest has flagged the pin as AI-generated via its
  // `digital_media_source_type` field (any non-null value).
  isAiGenerated: boolean;
}

export interface PinterestSearchPage {
  results: PinterestResult[];
  bookmarks: string[];
  isEnd: boolean;
  // Only set for board targets; total pins Pinterest reports on the board.
  // The in-memory `results` may be shorter (first-page cap), so this is what
  // the "Import all N pins" button displays.
  boardPinCount?: number;
}

export interface PinterestImportResult {
  imageId: number;
  filePath: string;
  alreadyImported: boolean;
}

export interface PinterestBulkImportProgress {
  jobId: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  currentPinId?: string;
  currentImageId?: number;
}

export interface PinterestBulkImportSummary {
  jobId: string;
  status: 'done' | 'cancelled' | 'error';
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
}
