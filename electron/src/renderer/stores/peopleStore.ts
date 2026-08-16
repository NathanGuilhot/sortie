import { create } from 'zustand';
import { Person, Image, FaceScanProgress, FaceScanResult } from 'shared';
import { runIpcTask } from '../ipc';
import { type OperationHandle, runOperation } from '../operations/runOperation';

interface PeopleStore {
  persons: Person[];
  selectedPerson: Person | null;
  personImages: Image[];
  personImageTotal: number;
  hasMorePersonImages: boolean;
  loading: boolean;
  error: string | null;
  scanning: boolean;
  scanProgress: FaceScanProgress | null;
  scanResult: FaceScanResult | null;
  scanHandle: OperationHandle<FaceScanResult> | null;

  fetchPersons: () => Promise<void>;
  selectPerson: (person: Person | null) => void;
  fetchPersonImages: (personId: number, limit?: number, offset?: number) => Promise<void>;
  loadMorePersonImages: () => Promise<void>;
  renamePerson: (personId: number, name: string) => Promise<void>;
  mergePersons: (keepPersonId: number, mergePersonId: number) => Promise<void>;
  splitFace: (faceId: number) => Promise<void>;
  scanFaces: () => Promise<void>;
  cancelScan: () => Promise<void>;
  deletePerson: (personId: number) => Promise<void>;
  setError: (error: string | null) => void;
  clearScanResult: () => void;
  resetFaceData: () => Promise<void>;
}

export const usePeopleStore = create<PeopleStore>((set, get) => ({
  persons: [],
  selectedPerson: null,
  personImages: [],
  personImageTotal: 0,
  hasMorePersonImages: false,
  loading: false,
  error: null,
  scanning: false,
  scanProgress: null,
  scanResult: null,
  scanHandle: null,

  setError: (error) => set({ error }),
  clearScanResult: () => set({ scanResult: null }),

  fetchPersons: async () => {
    set({ loading: true, error: null });
    await runIpcTask({
      run: () => window.sortieAPI.getPersons(),
      onSuccess: (persons) => set({ persons, loading: false }),
      onError: (message) => set({ error: message, loading: false }),
    });
  },

  selectPerson: (person) => {
    set({
      selectedPerson: person,
      personImages: [],
      personImageTotal: person?.image_count ?? 0,
      hasMorePersonImages: !!person && person.image_count > 0,
    });
    if (person) {
      void get().fetchPersonImages(person.id);
    }
  },

  fetchPersonImages: async (personId, limit = 100, offset = 0) => {
    await runIpcTask({
      run: () => window.sortieAPI.getPersonImages(personId, limit, offset),
      onSuccess: (page) =>
        set((state) => {
          const existing = offset > 0 ? state.personImages : [];
          const existingIds = new Set(existing.map((image) => image.id));
          const images = [
            ...existing,
            ...page.images.filter((image) => !existingIds.has(image.id)),
          ];
          return {
            personImages: images,
            personImageTotal: page.total,
            hasMorePersonImages: images.length < page.total,
          };
        }),
      onError: (message) => set({ error: message }),
    });
  },

  loadMorePersonImages: async () => {
    const { selectedPerson, personImages, hasMorePersonImages, loading } = get();
    if (!selectedPerson || !hasMorePersonImages || loading) return;
    set({ loading: true });
    await get().fetchPersonImages(selectedPerson.id, 100, personImages.length);
    set({ loading: false });
  },

  renamePerson: async (personId, name) => {
    await runIpcTask({
      run: () => window.sortieAPI.renamePerson(personId, name),
      onSuccess: () =>
        set((state) => ({
          persons: state.persons.map((p) => (p.id === personId ? { ...p, name } : p)),
          selectedPerson:
            state.selectedPerson?.id === personId
              ? { ...state.selectedPerson, name }
              : state.selectedPerson,
        })),
      onError: (message) => set({ error: message }),
    });
  },

  mergePersons: async (keepPersonId, mergePersonId) => {
    await runIpcTask({
      run: () => window.sortieAPI.mergePersons(keepPersonId, mergePersonId),
      onSuccess: async () => {
        await get().fetchPersons();
        const selected = get().selectedPerson;
        if (selected?.id === mergePersonId) {
          set({
            selectedPerson: null,
            personImages: [],
            personImageTotal: 0,
            hasMorePersonImages: false,
          });
        } else if (selected?.id === keepPersonId) {
          await get().fetchPersonImages(keepPersonId);
        }
      },
      onError: (message) => set({ error: message }),
    });
  },

  splitFace: async (faceId) => {
    await runIpcTask({
      run: () => window.sortieAPI.splitFaceFromPerson(faceId),
      onSuccess: async () => {
        await get().fetchPersons();
        const selected = get().selectedPerson;
        if (selected) {
          await get().fetchPersonImages(selected.id);
        }
      },
      onError: (message) => set({ error: message }),
    });
  },

  scanFaces: async () => {
    set({
      scanning: true,
      error: null,
      scanResult: null,
      scanProgress: { current: 0, total: 0, currentFile: '' },
      scanHandle: null,
    });
    const handle = runOperation({
      subscribe: window.sortieAPI.onFaceScanProgress,
      start: window.sortieAPI.processFaces,
      onProgress: (progress) => {
        set((state) => {
          if (!progress.personUpdates?.length) {
            return { scanProgress: progress };
          }
          const byId = new Map(state.persons.map((p) => [p.id, p]));
          for (const updated of progress.personUpdates) {
            byId.set(updated.id, updated);
          }
          return { scanProgress: progress, persons: [...byId.values()] };
        });
      },
    });
    set({ scanHandle: handle });

    await runIpcTask({
      run: () => handle.result,
      onSuccess: async (result) => {
        set({ scanning: false, scanProgress: null, scanResult: result, scanHandle: null });
        await get().fetchPersons();
      },
      onError: (message) =>
        set({ error: message, scanning: false, scanProgress: null, scanHandle: null }),
    });
  },

  cancelScan: async () => {
    const handle = get().scanHandle;
    if (!handle) return;
    await runIpcTask({
      run: handle.cancel,
      onError: (message) => set({ error: message }),
    });
  },

  resetFaceData: async () => {
    await runIpcTask({
      run: () => window.sortieAPI.resetFaceData(),
      onSuccess: () =>
        set({
          persons: [],
          selectedPerson: null,
          personImages: [],
          personImageTotal: 0,
          hasMorePersonImages: false,
          scanResult: null,
          error: null,
        }),
      onError: (message) => set({ error: message }),
    });
  },

  deletePerson: async (personId) => {
    await runIpcTask({
      run: () => window.sortieAPI.deletePerson(personId),
      onSuccess: () =>
        set((state) => ({
          persons: state.persons.filter((p) => p.id !== personId),
          selectedPerson: state.selectedPerson?.id === personId ? null : state.selectedPerson,
          personImages: state.selectedPerson?.id === personId ? [] : state.personImages,
          personImageTotal: state.selectedPerson?.id === personId ? 0 : state.personImageTotal,
          hasMorePersonImages:
            state.selectedPerson?.id === personId ? false : state.hasMorePersonImages,
        })),
      onError: (message) => set({ error: message }),
    });
  },
}));
