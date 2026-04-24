import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from 'shared';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerPeopleHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle(IPC_CHANNELS.getPersons, async () => {
    return await dbService.getPersons();
  });

  ipcMain.handle(
    IPC_CHANNELS.getPersonImages,
    async (
      _event,
      { personId, limit, offset }: { personId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getPersonImages(personId, limit, offset);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.renamePerson,
    async (_event, { personId, name }: { personId: number; name: string }) => {
      await dbService.renamePerson(personId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.mergePersons,
    async (
      _event,
      { keepPersonId, mergePersonId }: { keepPersonId: number; mergePersonId: number },
    ) => {
      await dbService.mergePersons(keepPersonId, mergePersonId);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.splitFaceFromPerson, async (_event, { faceId }: { faceId: number }) => {
    const newPersonId = await dbService.splitFaceFromPerson(faceId);
    return { newPersonId };
  });

  ipcMain.handle(IPC_CHANNELS.getImageFaces, async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getImageFaces(imageId);
  });

  ipcMain.handle(
    IPC_CHANNELS.setPersonThumbnail,
    async (_event, { personId, faceId }: { personId: number; faceId: number }) => {
      await dbService.setPersonThumbnail(personId, faceId);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.processFaces, async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.processExistingImagesForFaces(
        sendToRenderer(event.sender, IPC_EVENTS.faceScanProgress),
        signal,
      ),
    );
  });

  ipcMain.handle(IPC_CHANNELS.deletePerson, async (_event, { personId }: { personId: number }) => {
    await dbService.deletePerson(personId);
    return { success: true };
  });
}
