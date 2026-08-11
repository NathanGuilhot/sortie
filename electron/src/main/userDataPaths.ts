import path from 'path';

export interface SortieUserDataPaths {
  thumbs: string;
  rawPreviews: string;
  faceThumbs: string;
  dragIcons: string;
  dragExports: string;
  linkPreviews: string;
  models: string;
  database: string;
}

export function getSortieUserDataPaths(userDataRoot: string): SortieUserDataPaths {
  return {
    thumbs: path.join(userDataRoot, 'thumbs'),
    rawPreviews: path.join(userDataRoot, 'raw-previews'),
    faceThumbs: path.join(userDataRoot, 'face-thumbs'),
    dragIcons: path.join(userDataRoot, 'drag-icons'),
    dragExports: path.join(userDataRoot, 'drag-exports'),
    linkPreviews: path.join(userDataRoot, 'link-previews'),
    models: path.join(userDataRoot, 'models'),
    database: path.join(userDataRoot, 'sortie.db'),
  };
}
