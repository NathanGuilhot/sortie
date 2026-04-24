import { app, Menu, BrowserWindow, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { IPC_EVENTS } from 'shared';

const isMac = process.platform === 'darwin';

export function buildMenu(mainWindow: BrowserWindow | null): Menu {
  const appSubmenu: MenuItemConstructorOptions[] = [
    { role: 'about' },
    { type: 'separator' },
    { role: 'services' },
    { type: 'separator' },
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' },
  ];

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Sortie on GitHub',
      click: () => void shell.openExternal('https://github.com/nathanguilhot/sortie'),
    },
    ...(isMac
      ? []
      : ([
          { type: 'separator' },
          {
            label: 'About Sortie',
            click: () => mainWindow?.webContents.send(IPC_EVENTS.showAbout),
          },
        ] as MenuItemConstructorOptions[])),
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: appSubmenu } as MenuItemConstructorOptions] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: isMac
        ? [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
    { role: 'help', submenu: helpSubmenu },
  ];

  return Menu.buildFromTemplate(template);
}
