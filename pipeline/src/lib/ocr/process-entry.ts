// Entry of the OCR utility process (Electron `utilityProcess.fork`). OCR runs
// here, away from the app's main process: its image processing would otherwise
// stall the main process, and its onnxruntime (1.24) can't share a process
// with CLIP's (1.14) without a strict load order and crashes on quit.
import { createOcrEngine } from './index';
import type { OcrProcessReply, OcrProcessRequest } from './process-protocol';

interface ParentPort {
  on(event: 'message', listener: (event: { data: OcrProcessRequest }) => void): void;
  postMessage(message: OcrProcessReply): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const modelsPath = process.env.SORTIE_OCR_MODELS_PATH;

if (!parentPort || !modelsPath) {
  throw new Error('OCR process must be started by the app with SORTIE_OCR_MODELS_PATH set');
}

const engine = createOcrEngine({ modelsPath });

parentPort.on('message', ({ data }) => {
  engine.extract(data.filePath).then(
    (blocks) => parentPort.postMessage({ id: data.id, blocks }),
    (error: unknown) =>
      parentPort.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});
