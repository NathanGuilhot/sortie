import type { BoardInvokeArgsByKey, BoardInvokeResultByKey, BoardsApi } from './ipc/boards';
import { boardInvokeChannels } from './ipc/boards';
import type { FolderApi, FolderInvokeArgsByKey, FolderInvokeResultByKey } from './ipc/folders';
import { folderInvokeChannels } from './ipc/folders';
import type {
  ExternalImportApi,
  ExternalImportInvokeArgsByKey,
  ExternalImportInvokeResultByKey,
} from './ipc/external-import';
import { externalImportInvokeChannels } from './ipc/external-import';
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
  PinterestInvokeArgsByKey,
  PinterestInvokeResultByKey,
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
  ExternalBoardImportRequest,
  ExternalImportAction,
  ExternalImportComplete,
  ExternalImportProgress,
} from './ipc/external-import';
export type {
  PinterestBulkImportCancelResponse,
  PinterestBulkImportStartResponse,
  PinterestErrorCode,
  PinterestImportResponse,
  PinterestLoadMoreResponse,
  PinterestScrapeResponse,
  PinterestTarget,
} from './ipc/pinterest';

export interface SortieAPI
  extends
    ImageApi,
    BoardsApi,
    FolderApi,
    MaintenanceApi,
    PeopleApi,
    SystemApi,
    OcrApi,
    PinterestApi,
    ExternalImportApi {}

export const IPC_INVOKE_CHANNELS = {
  ...imageInvokeChannels,
  ...boardInvokeChannels,
  ...folderInvokeChannels,
  ...externalImportInvokeChannels,
  ...maintenanceInvokeChannels,
  ...peopleInvokeChannels,
  ...systemInvokeChannels,
  ...ocrInvokeChannels,
  ...pinterestInvokeChannels,
} as const;

export type InvokeArgsByKey = ImageInvokeArgsByKey &
  BoardInvokeArgsByKey &
  FolderInvokeArgsByKey &
  ExternalImportInvokeArgsByKey &
  MaintenanceInvokeArgsByKey &
  PeopleInvokeArgsByKey &
  SystemInvokeArgsByKey &
  OcrInvokeArgsByKey &
  PinterestInvokeArgsByKey;

export type InvokeResultByKey = ImageInvokeResultByKey &
  BoardInvokeResultByKey &
  FolderInvokeResultByKey &
  ExternalImportInvokeResultByKey &
  MaintenanceInvokeResultByKey &
  PeopleInvokeResultByKey &
  SystemInvokeResultByKey &
  OcrInvokeResultByKey &
  PinterestInvokeResultByKey;

export type InvokeKey = keyof typeof IPC_INVOKE_CHANNELS;
