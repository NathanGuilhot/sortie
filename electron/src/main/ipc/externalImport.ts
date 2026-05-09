import type { MainIpcContext } from './context';
import { handleInvoke } from './context';

export function registerExternalImportHandlers({ externalImportService }: MainIpcContext): void {
  handleInvoke('externalImportGetPendingBoardImport', async () => {
    return externalImportService.getPendingBoardImport();
  });

  handleInvoke('externalImportAddPendingImagesToBoard', async (_event, { jobId, tagId }) => {
    await externalImportService.addPendingImagesToBoard(jobId, tagId);
    return { success: true };
  });

  handleInvoke('externalImportDismissPendingBoardImport', async (_event, { jobId }) => {
    externalImportService.dismissPendingBoardImport(jobId);
    return { success: true };
  });
}
