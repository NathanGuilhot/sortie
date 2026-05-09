import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';

const execFileAsync = promisify(execFile);

interface WindowsVerb {
  verb: string;
  label: string;
  command: string;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function regAdd(key: string, name: string | null, value: string): Promise<void> {
  const args = ['add', key, '/f', '/t', 'REG_SZ', '/d', value];
  if (name) {
    args.splice(3, 0, '/v', name);
  } else {
    args.splice(3, 0, '/ve');
  }
  await execFileAsync('reg.exe', args, { windowsHide: true });
}

async function registerWindowsVerb(
  root: string,
  { verb, label, command }: WindowsVerb,
): Promise<void> {
  const key = `${root}\\shell\\${verb}`;
  await regAdd(key, null, label);
  await regAdd(`${key}\\command`, null, command);
}

export async function registerExternalImportEntrypoints(): Promise<void> {
  registerProtocolEntrypoint();

  if (process.platform !== 'win32' || !app.isPackaged) {
    return;
  }

  const exe = quote(process.execPath);
  const imageCommand = `${exe} --sortie-action=add-images-to-gallery "%1"`;
  const boardCommand = `${exe} --sortie-action=add-to-board "%1"`;
  const folderCommand = `${exe} --sortie-action=add-folder-to-gallery "%1"`;
  const imageVerbs: WindowsVerb[] = [
    {
      verb: 'SortieAddImagesToGallery',
      label: 'Add Images to Sortie Gallery',
      command: imageCommand,
    },
    { verb: 'SortieAddToBoard', label: 'Add to Sortie Board', command: boardCommand },
  ];
  const folderVerbs: WindowsVerb[] = [
    {
      verb: 'SortieAddFolderToGallery',
      label: 'Add Folder to Sortie Gallery',
      command: folderCommand,
    },
    { verb: 'SortieAddFolderToBoard', label: 'Add Folder to Sortie Board', command: boardCommand },
  ];

  try {
    for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
      const root = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}`;
      for (const verb of imageVerbs) {
        await registerWindowsVerb(root, verb);
      }
    }

    for (const verb of folderVerbs) {
      await registerWindowsVerb('HKCU\\Software\\Classes\\Directory', verb);
    }
  } catch (error) {
    console.warn('[external-import] failed to register Windows context menu:', error);
  }
}

function registerProtocolEntrypoint(): void {
  try {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient('sortie', process.execPath, [process.argv[1]]);
    } else {
      app.setAsDefaultProtocolClient('sortie');
    }
  } catch (error) {
    console.warn('[external-import] failed to register protocol handler:', error);
  }
}
