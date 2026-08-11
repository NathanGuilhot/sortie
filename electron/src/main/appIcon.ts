import { app } from 'electron';
import path from 'path';

export function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons', 'icon.png')
    : path.join(__dirname, '../../resources/icons/icon.png');
}
