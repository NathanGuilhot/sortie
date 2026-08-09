import { BrowserWindow, dialog, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';

export interface DirectoryPickerOptions {
  defaultPath?: string;
  message?: string;
  treatPackagesAsDirectories?: boolean;
}

export async function showDirectoryPicker(
  event: IpcMainInvokeEvent,
  options: DirectoryPickerOptions = {},
): Promise<string | null> {
  const properties: OpenDialogOptions['properties'] = ['openDirectory'];
  if (options.treatPackagesAsDirectories && process.platform === 'darwin') {
    properties.push('treatPackageAsDirectory');
  }

  const dialogOptions: OpenDialogOptions = {
    properties,
    ...(options.defaultPath ? { defaultPath: options.defaultPath } : {}),
    ...(options.message ? { message: options.message } : {}),
  };
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}
