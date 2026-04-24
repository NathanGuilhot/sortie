import type { MainIpcContext } from './context';
import { handleInvoke } from './context';

export function registerBoardHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('boardsList', async () => {
    return await dbService.getBoards();
  });

  handleInvoke('boardsGet', async (_event, { tagId }) => {
    return await dbService.getBoard(tagId);
  });

  handleInvoke('boardsGetImages', async (_event, { tagId, limit, offset }) => {
    return await dbService.getBoardImages(tagId, limit, offset);
  });

  handleInvoke('boardsReorder', async (_event, { tagId, orderedImageIds }) => {
    await dbService.reorderBoardImages(tagId, orderedImageIds);
    return { success: true };
  });

  handleInvoke('boardsGetImageSuggestions', async (_event, { tagId }) => {
    return await dbService.getBoardImageSuggestions(tagId);
  });

  handleInvoke('boardsAddImage', async (_event, { imageId, tagId }) => {
    await dbService.addImageToBoard(imageId, tagId);
    return { success: true };
  });

  handleInvoke('boardsRemoveImage', async (_event, { imageId, tagId }) => {
    await dbService.removeImageFromBoard(imageId, tagId);
    return { success: true };
  });

  handleInvoke('boardsCreate', async (_event, { name, color }) => {
    return await dbService.createBoard(name, color);
  });

  handleInvoke('boardsRename', async (_event, { tagId, name }) => {
    await dbService.renameBoard(tagId, name);
    return { success: true };
  });

  handleInvoke('boardsSetColor', async (_event, { tagId, color }) => {
    await dbService.setBoardColor(tagId, color);
    return { success: true };
  });

  handleInvoke('boardsDelete', async (_event, { tagId }) => {
    await dbService.deleteBoard(tagId);
    return { success: true };
  });

  handleInvoke('getCollections', async () => {
    return await dbService.getCollections();
  });

  handleInvoke('createCollection', async (_event, { name, description }) => {
    const collectionId = await dbService.createCollection(name, description);
    return { collectionId };
  });

  handleInvoke('organizeImages', async () => {
    const collectionIds = await dbService.organizeImages();
    return { collectionIds };
  });
}
