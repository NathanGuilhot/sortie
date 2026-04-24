import type { MainIpcContext } from './context';
import { handleInvoke } from './context';

export function registerBoardHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('boardsList', async () => {
    return await dbService.boards.getBoards();
  });

  handleInvoke('boardsGet', async (_event, { tagId }) => {
    return await dbService.boards.getBoard(tagId);
  });

  handleInvoke('boardsGetImages', async (_event, { tagId, limit, offset }) => {
    return await dbService.boards.getBoardImages(tagId, limit, offset);
  });

  handleInvoke('boardsReorder', async (_event, { tagId, orderedImageIds }) => {
    await dbService.boards.reorderBoardImages(tagId, orderedImageIds);
    return { success: true };
  });

  handleInvoke('boardsGetImageSuggestions', async (_event, { tagId }) => {
    return await dbService.boards.getBoardImageSuggestions(tagId);
  });

  handleInvoke('boardsAddImage', async (_event, { imageId, tagId }) => {
    await dbService.boards.addImageToBoard(imageId, tagId);
    return { success: true };
  });

  handleInvoke('boardsRemoveImage', async (_event, { imageId, tagId }) => {
    await dbService.boards.removeImageFromBoard(imageId, tagId);
    return { success: true };
  });

  handleInvoke('boardsCreate', async (_event, { name, color }) => {
    return await dbService.boards.createBoard(name, color);
  });

  handleInvoke('boardsRename', async (_event, { tagId, name }) => {
    await dbService.boards.renameBoard(tagId, name);
    return { success: true };
  });

  handleInvoke('boardsSetColor', async (_event, { tagId, color }) => {
    await dbService.boards.setBoardColor(tagId, color);
    return { success: true };
  });

  handleInvoke('boardsDelete', async (_event, { tagId }) => {
    await dbService.boards.deleteBoard(tagId);
    return { success: true };
  });
}
