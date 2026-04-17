import { Face } from 'shared';

export function buildFaceThumbUrl(face: Face, size: number = 200): string {
  const params = new URLSearchParams({
    path: face.image_path || '',
    x: String(face.bbox_x),
    y: String(face.bbox_y),
    w: String(face.bbox_w),
    h: String(face.bbox_h),
    size: String(size),
  });
  return `sortie-face://${face.id}?${params.toString()}`;
}
