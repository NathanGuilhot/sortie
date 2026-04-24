import { ipcMain } from 'electron';
import { IPC_CHANNELS } from 'shared';
import type { MainIpcContext } from './context';

export function registerBoardHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle(IPC_CHANNELS.boards.list, async () => {
    return await dbService.getBoards();
  });

  ipcMain.handle(IPC_CHANNELS.boards.get, async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoard(tagId);
  });

  ipcMain.handle(
    IPC_CHANNELS.boards.getImages,
    async (
      _event,
      { tagId, limit, offset }: { tagId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getBoardImages(tagId, limit, offset);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.boards.reorder,
    async (_event, { tagId, orderedImageIds }: { tagId: number; orderedImageIds: number[] }) => {
      await dbService.reorderBoardImages(tagId, orderedImageIds);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.boards.getImageSuggestions, async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoardImageSuggestions(tagId);
  });

  ipcMain.handle(
    IPC_CHANNELS.boards.addImage,
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.addImageToBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.boards.removeImage,
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.removeImageFromBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.boards.create,
    async (_event, { name, color }: { name: string; color?: string }) => {
      return await dbService.createBoard(name, color);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.boards.rename,
    async (_event, { tagId, name }: { tagId: number; name: string }) => {
      await dbService.renameBoard(tagId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.boards.setColor,
    async (_event, { tagId, color }: { tagId: number; color: string }) => {
      await dbService.setBoardColor(tagId, color);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.boards.delete, async (_event, { tagId }: { tagId: number }) => {
    await dbService.deleteBoard(tagId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.getCollections, async () => {
    return await dbService.getCollections();
  });

  ipcMain.handle(
    IPC_CHANNELS.createCollection,
    async (_event, { name, description }: { name: string; description?: string }) => {
      const collectionId = await dbService.createCollection(name, description);
      return { collectionId };
    },
  );

  ipcMain.handle(IPC_CHANNELS.organizeImages, async () => {
    const collectionIds = await dbService.organizeImages();
    return { collectionIds };
  });
}
