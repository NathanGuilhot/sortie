import { contextBridge } from 'electron';
import type { SortieAPI } from 'shared';
import { createBoardApi } from './api/boards';
import { createFolderApi } from './api/folders';
import { createImageApi } from './api/images';
import { createExternalImportApi } from './api/externalImport';
import { createMaintenanceApi } from './api/maintenance';
import { createOcrApi } from './api/ocr';
import { createPeopleApi } from './api/people';
import { createPinterestApi } from './api/pinterest';
import { createSystemApi } from './api/system';

const sortieAPI: SortieAPI = {
  ...createImageApi(),
  ...createBoardApi(),
  ...createFolderApi(),
  ...createExternalImportApi(),
  ...createMaintenanceApi(),
  ...createPeopleApi(),
  ...createSystemApi(),
  ...createOcrApi(),
  ...createPinterestApi(),
};

contextBridge.exposeInMainWorld('sortieAPI', sortieAPI);
