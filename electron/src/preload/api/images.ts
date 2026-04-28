import { IPC_EVENTS, type EmbedderStatus, type SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithImageId, invokeWithUrl, subscribe } from '../helpers';

export function createImageApi(): Pick<
  SortieAPI,
  | 'getImages'
  | 'getImage'
  | 'reshuffleImages'
  | 'query'
  | 'getEmbedderStatus'
  | 'onEmbedderStatus'
  | 'findSimilarImages'
  | 'getAllTags'
  | 'getTagsWithCounts'
  | 'updateImageTags'
  | 'hideImage'
  | 'updateImageMetadata'
  | 'getLinkPreview'
  | 'fetchLinkPreview'
  | 'getSuggestions'
  | 'dismissSuggestion'
  | 'recomputeEmbedding'
  | 'recomputePalette'
> {
  return {
    getImages: (limit?: number, offset?: number) => invoke('getImages', { limit, offset }),
    getImage: (id: number) => invoke('getImage', { id }),
    reshuffleImages: () => invokeNone('reshuffleImages'),
    query: (query) => invoke('queryImages', query),
    getEmbedderStatus: (): Promise<EmbedderStatus> => invokeNone('getEmbedderStatus'),
    onEmbedderStatus: (callback: (status: EmbedderStatus) => void) =>
      subscribe<EmbedderStatus>(IPC_EVENTS.embedderStatus, callback),
    findSimilarImages: (imageId: number, limit?: number) =>
      invoke('findSimilarImages', { imageId, limit }),
    getAllTags: () => invokeNone('getAllTags'),
    getTagsWithCounts: () => invokeNone('getTagsWithCounts'),
    updateImageTags: (imageId: number, tags: string[]) =>
      invoke('updateImageTags', { imageId, tags }),
    hideImage: (imageId: number) => invokeWithImageId('hideImage', imageId),
    updateImageMetadata: (imageId, metadata) =>
      invoke('updateImageMetadata', { imageId, metadata }),
    getLinkPreview: (url: string) => invokeWithUrl('getLinkPreview', url),
    fetchLinkPreview: (url: string) => invokeWithUrl('fetchLinkPreview', url),
    getSuggestions: (imageId: number) => invokeWithImageId('getSuggestions', imageId),
    dismissSuggestion: (imageId: number, tagId: number) =>
      invoke('dismissSuggestion', { imageId, tagId }),
    recomputeEmbedding: (imageId: number) => invokeWithImageId('recomputeEmbedding', imageId),
    recomputePalette: (imageId: number) => invokeWithImageId('recomputePalette', imageId),
  };
}
