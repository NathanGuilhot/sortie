import type { Image, OriginKind } from './images';

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

export interface Board {
  id: number;
  name: string;
  color: string;
  image_count: number;
  cover_image_id: number | null;
  cover_image_path: string | null;
  preview_image_paths: string[];
}

export interface Folder {
  id: number;
  path: string;
  watched: boolean;
  ignored: boolean;
  exclude_from_face_scan: boolean;
  available: boolean;
  writable: boolean;
  last_scanned: string | null;
  created_at: string;
}

export interface FolderWithStats extends Folder {
  image_count: number;
  total_size: number;
  folder_name: string;
}

export interface FolderStats {
  folders: FolderWithStats[];
  totalImages: number;
  totalSize: number;
}

export interface DismissedSuggestion {
  image_id: number;
  tag_id: number;
  dismissed_at: string;
}

export interface ImageSuggestion {
  imageId: number;
  confidence: number;
}

export interface TagSuggestion {
  tagId: number;
  tagName: string;
  confidence: number;
  source: 'cluster' | 'similarity';
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

// Unified filter/search request. Every dimension is optional; active ones
// are AND-composed. Only one of `text` / `imageBytes` may be set; they
// both drive CLIP embedding search and conflict. When any scored dimension
// (text / imageBytes / palette) is present, results are ranked by distance;
// otherwise they're returned in the current shuffled order.
export interface Query {
  text?: string;
  imageBytes?: Uint8Array;
  personId?: number;
  folderId?: number;
  tags?: string[];
  palette?: string[];
  favorites?: boolean;
  includeHidden?: boolean;
  origin?: { kind?: OriginKind; domain?: string };
  dateRange?: { start: string | null; end: string | null };
  limit?: number;
  offset?: number;
}
