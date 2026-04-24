import type { BoardInvokeArgsByKey, BoardInvokeResultByKey, BoardsApi } from './ipc/boards';
import { boardInvokeChannels } from './ipc/boards';
import type {
  FolderAvailabilityChange,
  SortieImageMetadataUpdate,
  SortieProgress,
  SuggestDefaultPhotoFolderResult,
} from './ipc/common';
import type { FolderApi, FolderInvokeArgsByKey, FolderInvokeResultByKey } from './ipc/folders';
import { folderInvokeChannels } from './ipc/folders';
import type { ImageApi, ImageInvokeArgsByKey, ImageInvokeResultByKey } from './ipc/images';
import { imageInvokeChannels } from './ipc/images';
import type {
  MaintenanceApi,
  MaintenanceInvokeArgsByKey,
  MaintenanceInvokeResultByKey,
} from './ipc/maintenance';
import { maintenanceInvokeChannels } from './ipc/maintenance';
import type { OcrApi, OcrInvokeArgsByKey, OcrInvokeResultByKey } from './ipc/ocr';
import { ocrInvokeChannels } from './ipc/ocr';
import type { PeopleApi, PeopleInvokeArgsByKey, PeopleInvokeResultByKey } from './ipc/people';
import { peopleInvokeChannels } from './ipc/people';
import type {
  PinterestApi,
  PinterestBulkImportCancelResponse,
  PinterestBulkImportStartResponse,
  PinterestImportResponse,
  PinterestInvokeArgsByKey,
  PinterestInvokeResultByKey,
  PinterestLoadMoreResponse,
  PinterestScrapeResponse,
  PinterestTarget,
} from './ipc/pinterest';
import { pinterestInvokeChannels } from './ipc/pinterest';
import type { SystemApi, SystemInvokeArgsByKey, SystemInvokeResultByKey } from './ipc/system';
import { systemInvokeChannels } from './ipc/system';

export type {
  FolderAvailabilityChange,
  SortieImageMetadataUpdate,
  SortieProgress,
  SuggestDefaultPhotoFolderResult,
} from './ipc/common';
export type {
  PinterestBulkImportCancelResponse,
  PinterestBulkImportStartResponse,
  PinterestImportResponse,
  PinterestLoadMoreResponse,
  PinterestScrapeResponse,
  PinterestTarget,
} from './ipc/pinterest';

export interface SortieAPI
  extends ImageApi,
    BoardsApi,
    FolderApi,
    MaintenanceApi,
    PeopleApi,
    SystemApi,
    OcrApi,
    PinterestApi {}

export const IPC_INVOKE_CHANNELS = {
  ...imageInvokeChannels,
  ...boardInvokeChannels,
  ...folderInvokeChannels,
  ...maintenanceInvokeChannels,
  ...peopleInvokeChannels,
  ...systemInvokeChannels,
  ...ocrInvokeChannels,
  ...pinterestInvokeChannels,
} as const;

export type InvokeArgsByKey = ImageInvokeArgsByKey &
  BoardInvokeArgsByKey &
  FolderInvokeArgsByKey &
  MaintenanceInvokeArgsByKey &
  PeopleInvokeArgsByKey &
  SystemInvokeArgsByKey &
  OcrInvokeArgsByKey &
  PinterestInvokeArgsByKey;

export type InvokeResultByKey = ImageInvokeResultByKey &
  BoardInvokeResultByKey &
  FolderInvokeResultByKey &
  MaintenanceInvokeResultByKey &
  PeopleInvokeResultByKey &
  SystemInvokeResultByKey &
  OcrInvokeResultByKey &
  PinterestInvokeResultByKey;

export type InvokeKey = keyof typeof IPC_INVOKE_CHANNELS;
