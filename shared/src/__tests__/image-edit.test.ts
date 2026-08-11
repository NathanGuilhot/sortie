import { describe, expect, it } from 'vitest';
import {
  adjustCrop,
  flipCropHorizontally,
  isNoopImageEdit,
  rotateCropClockwise,
  rotateOrientationClockwise,
} from '../image-edit';

describe('image edit geometry', () => {
  it('keeps a crop attached to its content when rotating clockwise', () => {
    expect(rotateCropClockwise({ left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 })).toEqual({
      left: 0.2,
      top: 0.1,
      right: 0.8,
      bottom: 0.6,
    });
  });

  it('keeps a crop attached to its content when flipping horizontally', () => {
    expect(flipCropHorizontally({ left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 })).toEqual({
      left: 0.4,
      top: 0.2,
      right: 0.9,
      bottom: 0.8,
    });
  });

  it('recognizes net-zero edits only', () => {
    const full = { left: 0, top: 0, right: 1, bottom: 1 };
    expect(isNoopImageEdit({ crop: full, clockwiseTurns: 4, flipHorizontal: false })).toBe(true);
    expect(isNoopImageEdit({ crop: full, clockwiseTurns: 1, flipHorizontal: false })).toBe(false);
    expect(
      isNoopImageEdit({ crop: { ...full, right: 0.9 }, clockwiseTurns: 0, flipHorizontal: false }),
    ).toBe(false);
  });

  it('moves a crop without letting it leave the image', () => {
    expect(adjustCrop({ left: 0.2, top: 0.2, right: 0.6, bottom: 0.6 }, 'move', 0.8, -0.5)).toEqual(
      { left: 0.6, top: 0, right: 1, bottom: 0.4 },
    );
  });

  it('resizes from sides and corners while preserving a minimum size', () => {
    const crop = { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 };
    expect(adjustCrop(crop, 'e', -1, 0).right).toBe(0.25);
    expect(adjustCrop(crop, 'nw', -0.1, 0.1)).toEqual({
      left: 0.1,
      top: 0.3,
      right: 0.8,
      bottom: 0.8,
    });
  });

  it('rotates clockwise in the current flipped coordinate space', () => {
    expect(rotateOrientationClockwise(1, false)).toBe(2);
    expect(rotateOrientationClockwise(1, true)).toBe(0);
  });
});
