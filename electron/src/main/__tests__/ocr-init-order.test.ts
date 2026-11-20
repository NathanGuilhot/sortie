import { describe, expect, it, vi } from 'vitest';
import { DatabaseOcrService } from '../database-ocr';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('pipeline', () => ({
  createOcrEngine: () => ({
    initialize: () => {
      calls.push('ocr-init');
      return Promise.resolve();
    },
    extract: () => {
      calls.push('ocr-extract');
      return Promise.resolve([]);
    },
  }),
  DatabaseManager: class {},
}));

function fakeDb() {
  return {
    ocr: {
      getOcrStatus: () => ({ status: 'pending', at: null }),
      saveImageOcr: vi.fn(),
      markOcrError: vi.fn(),
    },
    images: { getImagePath: () => '/library/a.jpg' },
  } as unknown as ConstructorParameters<typeof DatabaseOcrService>[0];
}

describe('DatabaseOcrService init order', () => {
  it('finishes the CLIP runtime hook before the OCR engine first loads, once', async () => {
    calls.length = 0;
    const beforeEngineInit = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      calls.push('clip-ready');
    });
    const service = new DatabaseOcrService(fakeDb(), '/models/ocr', beforeEngineInit);

    await service.ensure(1);
    await service.ensure(2);

    expect(calls).toEqual(['clip-ready', 'ocr-init', 'ocr-extract', 'ocr-extract']);
    expect(beforeEngineInit).toHaveBeenCalledTimes(1);
  });
});
