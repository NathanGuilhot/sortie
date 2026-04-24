import type { SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithImageId } from '../helpers';

export function createPeopleApi(): Pick<
  SortieAPI,
  | 'getPersons'
  | 'getPersonImages'
  | 'getPersonThumbnails'
  | 'renamePerson'
  | 'mergePersons'
  | 'splitFaceFromPerson'
  | 'getImageFaces'
  | 'setPersonThumbnail'
  | 'deletePerson'
> {
  return {
    getPersons: () => invokeNone('getPersons'),
    getPersonImages: (personId: number, limit?: number, offset?: number) =>
      invoke('getPersonImages', { personId, limit, offset }),
    getPersonThumbnails: (personIds: number[]) => invoke('getPersonThumbnails', { personIds }),
    renamePerson: (personId: number, name: string) => invoke('renamePerson', { personId, name }),
    mergePersons: (keepPersonId: number, mergePersonId: number) =>
      invoke('mergePersons', { keepPersonId, mergePersonId }),
    splitFaceFromPerson: (faceId: number) => invoke('splitFaceFromPerson', { faceId }),
    getImageFaces: (imageId: number) => invokeWithImageId('getImageFaces', imageId),
    setPersonThumbnail: (personId: number, faceId: number) =>
      invoke('setPersonThumbnail', { personId, faceId }),
    deletePerson: (personId: number) => invoke('deletePerson', { personId }),
  };
}
