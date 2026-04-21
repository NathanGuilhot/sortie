export interface OcrBlock {
  text: string;
  // Normalized 0–1 coordinates relative to the source image's displayed
  // orientation (same convention as DetectedFace.bbox).
  bbox: { x: number; y: number; width: number; height: number };
  // Four corner points in the same normalized space, ordered
  // top-left, top-right, bottom-right, bottom-left. Preserves rotation for
  // slanted text which plain axis-aligned bboxes can't.
  polygon?: [[number, number], [number, number], [number, number], [number, number]];
  confidence: number;
}

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
