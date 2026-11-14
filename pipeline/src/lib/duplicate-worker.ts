import { parentPort } from 'worker_threads';
import { analyzeFile, matchDuplicates, type AnalyzedImage } from './duplicate-analysis';

export type AnalysisTask =
  | { kind: 'analyze'; filePath: string }
  | { kind: 'match'; images: AnalyzedImage[]; dismissed: string[] };

parentPort?.on('message', (task: AnalysisTask) => {
  void (async () => {
    try {
      const value =
        task.kind === 'analyze'
          ? await analyzeFile(task.filePath)
          : await matchDuplicates(task.images, task.dismissed);
      parentPort!.postMessage({ value });
    } catch (error) {
      parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
