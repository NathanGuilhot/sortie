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
