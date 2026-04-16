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
  camera_make?: string | null;
  camera_model?: string | null;
  aperture?: number | null;
  iso?: number | null;
  exposure_time?: string | null;
  focal_length?: number | null;
  embedded?: boolean;
  file_hash?: string | null;
  dhash?: string | null;
  tags?: Tag[];
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
