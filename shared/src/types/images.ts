import type { Tag } from './organization';

// `unknown` means examined without evidence; NULL means not examined yet.
export type OriginKind = 'downloaded' | 'screenshot' | 'camera' | 'imported' | 'unknown';

export const ORIGIN_KINDS: readonly OriginKind[] = [
  'downloaded',
  'screenshot',
  'camera',
  'imported',
  'unknown',
];

// Only inferred links may be refreshed by later scans.
export type WebsiteLinkSource = 'user' | 'inferred';

export interface ImageOrigin {
  kind: OriginKind;
  /** Referring page when the OS recorded one, else the direct file URL. */
  url: string | null;
  /** Hostname of `url`, lowercased with a leading `www.` stripped. */
  domain: string | null;
  /** When the file was acquired, as an ISO string. Never a capture time. */
  at: string | null;
}

export interface OriginFacets {
  kinds: Array<{ kind: OriginKind; count: number }>;
  domains: Array<{ domain: string; count: number }>;
}

export interface Image {
  id: number;
  file_path: string;
  file_name: string;
  file_size: number | null;
  file_mtime_ms?: number | null;
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
  website_link_source?: WebsiteLinkSource | null;
  origin_kind?: OriginKind | null;
  origin_domain?: string | null;
  origin_at?: string | null;
  tags?: Tag[];
  palette?: PaletteColor[] | null;
}

export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
  weight: number;
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

export type SearchResult = Image & {
  distance?: number;
  tags?: Tag[];
};

export interface ImagePage<T extends Image = Image> {
  images: T[];
  total: number;
}
