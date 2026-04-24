export type { OcrBlock } from 'shared';
import type { OcrBlock } from 'shared';

export interface OcrEngine {
  initialize(): Promise<void>;
  extract(input: string | Buffer): Promise<OcrBlock[]>;
}

export interface OcrEngineOptions {
  // Absolute path to a directory containing the three ONNX files + dict:
  //   - detection.onnx
  //   - recognition.onnx
  //   - dictionary.txt
  modelsPath: string;
}
