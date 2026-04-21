import { PaddleOcrEngine } from './paddle';
import type { OcrEngine, OcrEngineOptions } from './types';

export type { OcrBlock, OcrEngine, OcrEngineOptions } from './types';
export { PaddleOcrEngine } from './paddle';

// Single factory so the rest of the app imports an interface, not a concrete
// class. A future Vision backend drops in here behind a platform switch.
export function createOcrEngine(options: OcrEngineOptions): OcrEngine {
  return new PaddleOcrEngine(options);
}
