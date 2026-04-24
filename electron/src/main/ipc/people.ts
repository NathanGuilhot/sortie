import { ipcMain } from 'electron';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerPeopleHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle('get-persons', async () => {
    return await dbService.getPersons();
  });

  ipcMain.handle(
    'get-person-images',
    async (
      _event,
      { personId, limit, offset }: { personId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getPersonImages(personId, limit, offset);
    },
  );

  ipcMain.handle(
    'rename-person',
    async (_event, { personId, name }: { personId: number; name: string }) => {
      await dbService.renamePerson(personId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    'merge-persons',
    async (
      _event,
      { keepPersonId, mergePersonId }: { keepPersonId: number; mergePersonId: number },
    ) => {
      await dbService.mergePersons(keepPersonId, mergePersonId);
      return { success: true };
    },
  );

  ipcMain.handle('split-face-from-person', async (_event, { faceId }: { faceId: number }) => {
    const newPersonId = await dbService.splitFaceFromPerson(faceId);
    return { newPersonId };
  });

  ipcMain.handle('get-image-faces', async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getImageFaces(imageId);
  });

  ipcMain.handle(
    'set-person-thumbnail',
    async (_event, { personId, faceId }: { personId: number; faceId: number }) => {
      await dbService.setPersonThumbnail(personId, faceId);
      return { success: true };
    },
  );

  ipcMain.handle('process-faces', async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.processExistingImagesForFaces(
        sendToRenderer(event.sender, 'face-scan-progress'),
        signal,
      ),
    );
  });

  ipcMain.handle('delete-person', async (_event, { personId }: { personId: number }) => {
    await dbService.deletePerson(personId);
    return { success: true };
  });
}
