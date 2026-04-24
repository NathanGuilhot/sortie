import type { Face, Image, Person } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';

export interface PeopleApi {
  getPersons: () => Promise<Person[]>;
  getPersonImages: (personId: number, limit?: number, offset?: number) => Promise<Image[]>;
  getPersonThumbnails: (personIds: number[]) => Promise<Face[]>;
  renamePerson: (personId: number, name: string) => Promise<{ success: boolean }>;
  mergePersons: (
    keepPersonId: number,
    mergePersonId: number,
  ) => Promise<{ success: boolean }>;
  splitFaceFromPerson: (faceId: number) => Promise<{ newPersonId: number }>;
  getImageFaces: (imageId: number) => Promise<Face[]>;
  setPersonThumbnail: (personId: number, faceId: number) => Promise<{ success: boolean }>;
  deletePerson: (personId: number) => Promise<{ success: boolean }>;
}

export const peopleInvokeChannels = {
  getPersons: IPC_CHANNELS.getPersons,
  getPersonImages: IPC_CHANNELS.getPersonImages,
  getPersonThumbnails: IPC_CHANNELS.getPersonThumbnails,
  renamePerson: IPC_CHANNELS.renamePerson,
  mergePersons: IPC_CHANNELS.mergePersons,
  splitFaceFromPerson: IPC_CHANNELS.splitFaceFromPerson,
  getImageFaces: IPC_CHANNELS.getImageFaces,
  setPersonThumbnail: IPC_CHANNELS.setPersonThumbnail,
  deletePerson: IPC_CHANNELS.deletePerson,
} as const;

export interface PeopleInvokeArgsByKey {
  getPersons: undefined;
  getPersonImages: { personId: number; limit?: number; offset?: number };
  getPersonThumbnails: { personIds: number[] };
  renamePerson: { personId: number; name: string };
  mergePersons: { keepPersonId: number; mergePersonId: number };
  splitFaceFromPerson: { faceId: number };
  getImageFaces: { imageId: number };
  setPersonThumbnail: { personId: number; faceId: number };
  deletePerson: { personId: number };
}

export interface PeopleInvokeResultByKey {
  getPersons: Person[];
  getPersonImages: Image[];
  getPersonThumbnails: Face[];
  renamePerson: { success: boolean };
  mergePersons: { success: boolean };
  splitFaceFromPerson: { newPersonId: number };
  getImageFaces: Face[];
  setPersonThumbnail: { success: boolean };
  deletePerson: { success: boolean };
}
