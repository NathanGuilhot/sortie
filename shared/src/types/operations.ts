export interface CancellableResult {
  cancelled: boolean;
}

export interface FaceScanResult extends CancellableResult {
  scanned: number;
  detected: number;
}

export interface ScanFolderResult extends CancellableResult {
  folderId: number;
  processed: number;
}

export interface HashScanResult extends CancellableResult {
  computed: number;
}

export interface BackfillExifResult extends CancellableResult {
  filled: number;
}
