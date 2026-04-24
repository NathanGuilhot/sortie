import { ipcMain } from 'electron';
import type { MainIpcContext } from './context';

export function registerBoardHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle('boards:list', async () => {
    return await dbService.getBoards();
  });

  ipcMain.handle('boards:get', async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoard(tagId);
  });

  ipcMain.handle(
    'boards:get-images',
    async (
      _event,
      { tagId, limit, offset }: { tagId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getBoardImages(tagId, limit, offset);
    },
  );

  ipcMain.handle(
    'boards:reorder',
    async (_event, { tagId, orderedImageIds }: { tagId: number; orderedImageIds: number[] }) => {
      await dbService.reorderBoardImages(tagId, orderedImageIds);
      return { success: true };
    },
  );

  ipcMain.handle('boards:get-image-suggestions', async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoardImageSuggestions(tagId);
  });

  ipcMain.handle(
    'boards:add-image',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.addImageToBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:remove-image',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.removeImageFromBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:create',
    async (_event, { name, color }: { name: string; color?: string }) => {
      return await dbService.createBoard(name, color);
    },
  );

  ipcMain.handle(
    'boards:rename',
    async (_event, { tagId, name }: { tagId: number; name: string }) => {
      await dbService.renameBoard(tagId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:set-color',
    async (_event, { tagId, color }: { tagId: number; color: string }) => {
      await dbService.setBoardColor(tagId, color);
      return { success: true };
    },
  );

  ipcMain.handle('boards:delete', async (_event, { tagId }: { tagId: number }) => {
    await dbService.deleteBoard(tagId);
    return { success: true };
  });

  ipcMain.handle('get-collections', async () => {
    return await dbService.getCollections();
  });

  ipcMain.handle(
    'create-collection',
    async (_event, { name, description }: { name: string; description?: string }) => {
      const collectionId = await dbService.createCollection(name, description);
      return { collectionId };
    },
  );

  ipcMain.handle('organize-images', async () => {
    const collectionIds = await dbService.organizeImages();
    return { collectionIds };
  });
}
