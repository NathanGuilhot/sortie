import type { Image, OriginKind } from 'shared';

export const ORIGIN_KIND_LABELS: Record<OriginKind, string> = {
  downloaded: 'Saved from the web',
  screenshot: 'Screenshot',
  camera: 'Shot on a camera',
  imported: 'Imported into Sortie',
  unknown: 'Origin unknown',
};

export function describeOrigin(image: Image): string | null {
  if (!image.origin_kind) return null;

  const when = formatOriginDate(image.origin_at);

  if (image.origin_kind === 'camera') {
    const camera = [image.camera_make, image.camera_model].filter(Boolean).join(' ');
    return camera ? `Shot on ${camera}` : ORIGIN_KIND_LABELS.camera;
  }

  if (image.origin_domain) {
    const verb = image.origin_kind === 'imported' ? 'Imported from' : 'Saved from';
    return when ? `${verb} ${image.origin_domain} · ${when}` : `${verb} ${image.origin_domain}`;
  }

  const label = ORIGIN_KIND_LABELS[image.origin_kind];
  return when ? `${label} · ${when}` : label;
}

function formatOriginDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
