import type { Board, Image, ImagePage } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';

export interface BoardsApi {
  boards: {
    list: () => Promise<Board[]>;
    get: (tagId: number) => Promise<Board | null>;
    getImages: (tagId: number, limit?: number, offset?: number) => Promise<ImagePage<Image>>;
    getImageSuggestions: (tagId: number) => Promise<Image[]>;
    reorder: (tagId: number, orderedImageIds: number[]) => Promise<{ success: boolean }>;
    addImage: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
    addImages: (imageIds: number[], tagId: number) => Promise<{ success: boolean }>;
    removeImage: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
    create: (name: string, color?: string) => Promise<Board>;
    rename: (tagId: number, name: string) => Promise<{ success: boolean }>;
    setColor: (tagId: number, color: string) => Promise<{ success: boolean }>;
    delete: (tagId: number) => Promise<{ success: boolean }>;
  };
}

export const boardInvokeChannels = {
  boardsList: IPC_CHANNELS.boards.list,
  boardsGet: IPC_CHANNELS.boards.get,
  boardsGetImages: IPC_CHANNELS.boards.getImages,
  boardsGetImageSuggestions: IPC_CHANNELS.boards.getImageSuggestions,
  boardsReorder: IPC_CHANNELS.boards.reorder,
  boardsAddImage: IPC_CHANNELS.boards.addImage,
  boardsAddImages: IPC_CHANNELS.boards.addImages,
  boardsRemoveImage: IPC_CHANNELS.boards.removeImage,
  boardsCreate: IPC_CHANNELS.boards.create,
  boardsRename: IPC_CHANNELS.boards.rename,
  boardsSetColor: IPC_CHANNELS.boards.setColor,
  boardsDelete: IPC_CHANNELS.boards.delete,
} as const;

export interface BoardInvokeArgsByKey {
  boardsList: undefined;
  boardsGet: { tagId: number };
  boardsGetImages: { tagId: number; limit?: number; offset?: number };
  boardsGetImageSuggestions: { tagId: number };
  boardsReorder: { tagId: number; orderedImageIds: number[] };
  boardsAddImage: { imageId: number; tagId: number };
  boardsAddImages: { imageIds: number[]; tagId: number };
  boardsRemoveImage: { imageId: number; tagId: number };
  boardsCreate: { name: string; color?: string };
  boardsRename: { tagId: number; name: string };
  boardsSetColor: { tagId: number; color: string };
  boardsDelete: { tagId: number };
}

export interface BoardInvokeResultByKey {
  boardsList: Board[];
  boardsGet: Board | null;
  boardsGetImages: ImagePage<Image>;
  boardsGetImageSuggestions: Image[];
  boardsReorder: { success: boolean };
  boardsAddImage: { success: boolean };
  boardsAddImages: { success: boolean };
  boardsRemoveImage: { success: boolean };
  boardsCreate: Board;
  boardsRename: { success: boolean };
  boardsSetColor: { success: boolean };
  boardsDelete: { success: boolean };
}
