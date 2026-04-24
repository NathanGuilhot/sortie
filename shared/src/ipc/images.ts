import type {
  EmbedderStatus,
  Image,
  LinkPreview,
  Query,
  SearchResult,
  Tag,
  TagSuggestion,
  TagWithCount,
} from '../types';
import { IPC_CHANNELS } from '../ipc-channels';
import type { SortieImageMetadataUpdate } from './common';

export interface ImageApi {
  getImages: (limit?: number, offset?: number) => Promise<Image[]>;
  getImage: (id: number) => Promise<Image | null>;
  reshuffleImages: () => Promise<{ success: boolean }>;
  query: (query: Query) => Promise<SearchResult[]>;
  getEmbedderStatus: () => Promise<EmbedderStatus>;
  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) => () => void;
  findSimilarImages: (imageId: number, limit?: number) => Promise<SearchResult[]>;
  getAllTags: () => Promise<Tag[]>;
  getTagsWithCounts: () => Promise<TagWithCount[]>;
  updateImageTags: (imageId: number, tags: string[]) => Promise<{ success: boolean }>;
  hideImage: (imageId: number) => Promise<{ success: boolean }>;
  updateImageMetadata: (
    imageId: number,
    metadata: SortieImageMetadataUpdate,
  ) => Promise<{ success: boolean }>;
  getLinkPreview: (url: string) => Promise<LinkPreview | null>;
  fetchLinkPreview: (url: string) => Promise<LinkPreview>;
  getSuggestions: (imageId: number) => Promise<TagSuggestion[]>;
  dismissSuggestion: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
  recomputeEmbedding: (imageId: number) => Promise<{ success: boolean }>;
  recomputePalette: (imageId: number) => Promise<{ success: boolean }>;
}

export const imageInvokeChannels = {
  getImages: IPC_CHANNELS.getImages,
  getImage: IPC_CHANNELS.getImage,
  reshuffleImages: IPC_CHANNELS.reshuffleImages,
  queryImages: IPC_CHANNELS.queryImages,
  getEmbedderStatus: IPC_CHANNELS.getEmbedderStatus,
  findSimilarImages: IPC_CHANNELS.findSimilarImages,
  getAllTags: IPC_CHANNELS.getAllTags,
  getTagsWithCounts: IPC_CHANNELS.getTagsWithCounts,
  updateImageTags: IPC_CHANNELS.updateImageTags,
  hideImage: IPC_CHANNELS.hideImage,
  updateImageMetadata: IPC_CHANNELS.updateImageMetadata,
  getLinkPreview: IPC_CHANNELS.getLinkPreview,
  fetchLinkPreview: IPC_CHANNELS.fetchLinkPreview,
  getSuggestions: IPC_CHANNELS.getSuggestions,
  dismissSuggestion: IPC_CHANNELS.dismissSuggestion,
  recomputeEmbedding: IPC_CHANNELS.recomputeEmbedding,
  recomputePalette: IPC_CHANNELS.recomputePalette,
} as const;

export interface ImageInvokeArgsByKey {
  getImages: { limit?: number; offset?: number } | undefined;
  getImage: { id: number };
  reshuffleImages: undefined;
  queryImages: Query;
  getEmbedderStatus: undefined;
  findSimilarImages: { imageId: number; limit?: number };
  getAllTags: undefined;
  getTagsWithCounts: undefined;
  updateImageTags: { imageId: number; tags: string[] };
  hideImage: { imageId: number };
  updateImageMetadata: { imageId: number; metadata: SortieImageMetadataUpdate };
  getLinkPreview: { url: string };
  fetchLinkPreview: { url: string };
  getSuggestions: { imageId: number };
  dismissSuggestion: { imageId: number; tagId: number };
  recomputeEmbedding: { imageId: number };
  recomputePalette: { imageId: number };
}

export interface ImageInvokeResultByKey {
  getImages: Image[];
  getImage: Image | null;
  reshuffleImages: { success: boolean };
  queryImages: SearchResult[];
  getEmbedderStatus: EmbedderStatus;
  findSimilarImages: SearchResult[];
  getAllTags: Tag[];
  getTagsWithCounts: TagWithCount[];
  updateImageTags: { success: boolean };
  hideImage: { success: boolean };
  updateImageMetadata: { success: boolean };
  getLinkPreview: LinkPreview | null;
  fetchLinkPreview: LinkPreview;
  getSuggestions: TagSuggestion[];
  dismissSuggestion: { success: boolean };
  recomputeEmbedding: { success: boolean };
  recomputePalette: { success: boolean };
}
