import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron';
import { createDefaultArchiveName, ensureZipExtension, exportBoardZip } from '../boardExport';
import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';

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

  handleInvoke('boardsAddImages', async (_event, { imageIds, tagId }) => {
    await dbService.boards.addImagesToBoard(imageIds, tagId);
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

  handleInvoke('boardsExportZip', async (event, { tagId, opId }) => {
    const board = await dbService.boards.getBoard(tagId);
    if (!board) {
      return {
        status: 'failed',
        failures: [{ fileName: 'Board', reason: 'Board not found' }],
      };
    }

    const snapshot = await dbService.boards.getBoardImages(tagId);
    if (snapshot.images.length === 0) {
      return {
        status: 'failed',
        failures: [{ fileName: board.name, reason: 'The board has no visible images' }],
      };
    }

    const options: SaveDialogOptions = {
      title: 'Export board',
      defaultPath: createDefaultArchiveName(board.name),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const selection = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return { status: 'dialog-cancelled' };
    const destinationPath = ensureZipExtension(selection.filePath);

    const emitter = createThrottledEmitter(event.sender, 'boardExportProgress');
    try {
      return await withOperation(opId, (signal) =>
        exportBoardZip({
          images: snapshot.images,
          destinationPath,
          signal,
          onProgress: (progress) => emitter.emit({ ...progress, opId }),
        }),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('boardsDelete', async (_event, { tagId }) => {
    await dbService.boards.deleteBoard(tagId);
    return { success: true };
  });
}
