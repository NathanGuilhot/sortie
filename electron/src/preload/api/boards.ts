import type { SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithTagId, subscribeEvent } from '../helpers';

export function createBoardApi(): Pick<SortieAPI, 'boards'> {
  return {
    boards: {
      list: () => invokeNone('boardsList'),
      get: (tagId: number) => invokeWithTagId('boardsGet', tagId),
      getImages: (tagId: number, limit?: number, offset?: number) =>
        invoke('boardsGetImages', { tagId, limit, offset }),
      getImageSuggestions: (tagId: number) => invokeWithTagId('boardsGetImageSuggestions', tagId),
      reorder: (tagId: number, orderedImageIds: number[]) =>
        invoke('boardsReorder', { tagId, orderedImageIds }),
      addImage: (imageId: number, tagId: number) => invoke('boardsAddImage', { imageId, tagId }),
      addImages: (imageIds: number[], tagId: number) =>
        invoke('boardsAddImages', { imageIds, tagId }),
      removeImage: (imageId: number, tagId: number) =>
        invoke('boardsRemoveImage', { imageId, tagId }),
      create: (name: string, color?: string) => invoke('boardsCreate', { name, color }),
      rename: (tagId: number, name: string) => invoke('boardsRename', { tagId, name }),
      setColor: (tagId: number, color: string) => invoke('boardsSetColor', { tagId, color }),
      exportZip: (tagId: number, opId: string) => invoke('boardsExportZip', { tagId, opId }),
      onExportProgress: (callback) => subscribeEvent('boardExportProgress', callback),
      delete: (tagId: number) => invokeWithTagId('boardsDelete', tagId),
    },
  };
}
