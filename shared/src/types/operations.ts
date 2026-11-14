export interface CancellableResult {
  cancelled: boolean;
}

export interface ScanFolderResult extends CancellableResult {
  folderId: number;
  processed: number;
}

export interface BackfillExifResult extends CancellableResult {
  filled: number;
}
