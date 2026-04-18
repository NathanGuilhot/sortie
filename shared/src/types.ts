export interface Image {
  id: number;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  modified_at: string;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  description: string | null;
  favorite: boolean;
  hidden: boolean;
  missing: boolean;
  camera_make?: string | null;
  camera_model?: string | null;
  aperture?: number | null;
  iso?: number | null;
  exposure_time?: string | null;
  focal_length?: number | null;
  embedded?: boolean;
  file_hash?: string | null;
  dhash?: string | null;
  website_link?: string | null;
  tags?: Tag[];
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image_path: string | null;
  fetched_at: string;
  error: string | null;
}

export interface DuplicateGroup {
  groupId: number;
  images: Image[];
  matchType: 'exact' | 'visual';
}

export interface DuplicateScanProgress {
  phase: 'hashing' | 'comparing' | 'done';
  current: number;
  total: number;
  currentFile?: string;
}

export interface Tag {
  id: number;
  name: string;
  category: 'user' | 'ai' | 'location' | 'camera' | null;
  color: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  usage_count: number;
}

export interface ImageTag {
  image_id: number;
  tag_id: number;
  source: 'user' | 'ai' | 'auto';
  confidence: number | null;
  created_at: string;
}

export interface EmbeddingRow {
  rowid: number;
  embedding: number[];
}

export interface Folder {
  id: number;
  path: string;
  watched: boolean;
  ignored: boolean;
  exclude_from_face_scan: boolean;
  available: boolean;
  last_scanned: string | null;
  created_at: string;
}

export interface FolderWithStats extends Folder {
  image_count: number;
  total_size: number;
  folder_name: string;
}

export interface DismissedSuggestion {
  image_id: number;
  tag_id: number;
  dismissed_at: string;
}

export interface MetadataChange {
  id: number;
  image_id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export type SearchResult = Image & {
  distance?: number;
  tags?: Tag[];
};

export interface Person {
  id: number;
  name: string | null;
  thumbnail_face_id: number | null;
  face_count: number;
  created_at: string;
  updated_at: string;
}

export interface Face {
  id: number;
  image_id: number;
  person_id: number | null;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  confidence: number;
  created_at: string;
  person_name?: string | null;
  image_path?: string;
}

export interface FaceScanProgress {
  current: number;
  total: number;
  currentFile: string;
  personUpdates?: Person[];
}

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

export type EmbedderStatus =
  | { state: 'idle' }
  | { state: 'warming' }
  | { state: 'ready' }
  | { state: 'error'; message: string };
