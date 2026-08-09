import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';

export function registerPeopleHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('getPersons', async () => {
    return await dbService.people.getPersons();
  });

  handleInvoke('getPersonImages', async (_event, { personId, limit, offset }) => {
    return await dbService.people.getPersonImages(personId, limit, offset);
  });

  handleInvoke('getPersonThumbnails', async (_event, { personIds }) => {
    return await dbService.people.getPersonThumbnails(personIds);
  });

  handleInvoke('renamePerson', async (_event, { personId, name }) => {
    await dbService.people.renamePerson(personId, name);
    return { success: true };
  });

  handleInvoke('mergePersons', async (_event, { keepPersonId, mergePersonId }) => {
    await dbService.people.mergePersons(keepPersonId, mergePersonId);
    return { success: true };
  });

  handleInvoke('splitFaceFromPerson', async (_event, { faceId }) => {
    const newPersonId = await dbService.people.splitFaceFromPerson(faceId);
    return { newPersonId };
  });

  handleInvoke('getImageFaces', async (_event, { imageId }) => {
    return await dbService.people.getImageFaces(imageId);
  });

  handleInvoke('setPersonThumbnail', async (_event, { personId, faceId }) => {
    await dbService.people.setPersonThumbnail(personId, faceId);
    return { success: true };
  });

  handleInvoke('processFaces', async (event, { opId }) => {
    const emitter = createThrottledEmitter(event.sender, 'faceScanProgress');
    try {
      return await withOperation(opId, (signal) =>
        dbService.people.processExistingImagesForFaces(
          (progress) => emitter.emit({ ...progress, opId }),
          signal,
        ),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('deletePerson', async (_event, { personId }) => {
    await dbService.people.deletePerson(personId);
    return { success: true };
  });
}
