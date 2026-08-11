import type { ImageEditTransform } from './ipc/images';

export type NormalizedCrop = ImageEditTransform['crop'];
export type CropHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const MIN_CROP_SIZE = 0.05;

export function adjustCrop(
  crop: NormalizedCrop,
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
): NormalizedCrop {
  let { left, top, right, bottom } = crop;
  if (handle === 'move') {
    deltaX = clamp(deltaX, -left, 1 - right);
    deltaY = clamp(deltaY, -top, 1 - bottom);
    return {
      left: clean(left + deltaX),
      top: clean(top + deltaY),
      right: clean(right + deltaX),
      bottom: clean(bottom + deltaY),
    };
  }
  if (handle.includes('w')) left = clamp(left + deltaX, 0, right - MIN_CROP_SIZE);
  if (handle.includes('e')) right = clamp(right + deltaX, left + MIN_CROP_SIZE, 1);
  if (handle.includes('n')) top = clamp(top + deltaY, 0, bottom - MIN_CROP_SIZE);
  if (handle.includes('s')) bottom = clamp(bottom + deltaY, top + MIN_CROP_SIZE, 1);
  return { left: clean(left), top: clean(top), right: clean(right), bottom: clean(bottom) };
}

export function rotateCropClockwise(crop: NormalizedCrop): NormalizedCrop {
  return {
    left: clean(1 - crop.bottom),
    top: crop.left,
    right: clean(1 - crop.top),
    bottom: crop.right,
  };
}

export function rotateOrientationClockwise(clockwiseTurns: number, flipped: boolean): number {
  return (((clockwiseTurns + (flipped ? -1 : 1)) % 4) + 4) % 4;
}

export function flipCropHorizontally(crop: NormalizedCrop): NormalizedCrop {
  return {
    left: clean(1 - crop.right),
    top: crop.top,
    right: clean(1 - crop.left),
    bottom: crop.bottom,
  };
}

function clean(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isNoopImageEdit(transform: ImageEditTransform): boolean {
  const { crop } = transform;
  return (
    transform.clockwiseTurns % 4 === 0 &&
    !transform.flipHorizontal &&
    crop.left === 0 &&
    crop.top === 0 &&
    crop.right === 1 &&
    crop.bottom === 1
  );
}
