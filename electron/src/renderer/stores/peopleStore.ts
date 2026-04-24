import { create } from 'zustand';
import { Person, Image, FaceScanProgress, FaceScanResult } from 'shared';
import { runIpcTask } from '../ipc';

interface PeopleStore {
  persons: Person[];
  selectedPerson: Person | null;
  personImages: Image[];
  loading: boolean;
  error: string | null;
  scanning: boolean;
  scanProgress: FaceScanProgress | null;
  scanResult: FaceScanResult | null;
  currentOpId: string | null;

  fetchPersons: () => Promise<void>;
  selectPerson: (person: Person | null) => void;
  fetchPersonImages: (personId: number, limit?: number, offset?: number) => Promise<void>;
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
  loading: false,
  error: null,
  scanning: false,
  scanProgress: null,
  scanResult: null,
  currentOpId: null,

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
    set({ selectedPerson: person, personImages: [] });
    if (person) {
      void get().fetchPersonImages(person.id);
    }
  },

  fetchPersonImages: async (personId, limit = 100, offset = 0) => {
    await runIpcTask({
      run: () => window.sortieAPI.getPersonImages(personId, limit, offset),
      onSuccess: (images) => set({ personImages: images }),
      onError: (message) => set({ error: message }),
    });
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
          set({ selectedPerson: null, personImages: [] });
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
    const opId = crypto.randomUUID();
    set({
      scanning: true,
      error: null,
      scanResult: null,
      scanProgress: { current: 0, total: 0, currentFile: '' },
      currentOpId: opId,
    });

    const unsubscribe = window.sortieAPI.onFaceScanProgress((progress) => {
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
    });

    await runIpcTask({
      run: () => window.sortieAPI.processFaces(opId),
      onSuccess: async (result) => {
        set({ scanning: false, scanProgress: null, scanResult: result, currentOpId: null });
        await get().fetchPersons();
      },
      onError: (message) =>
        set({ error: message, scanning: false, scanProgress: null, currentOpId: null }),
      onFinally: unsubscribe,
    });
  },

  cancelScan: async () => {
    const opId = get().currentOpId;
    if (!opId) return;
    await runIpcTask({
      run: () => window.sortieAPI.cancelOperation(opId),
      onError: (message) => set({ error: message }),
    });
  },

  resetFaceData: async () => {
    await runIpcTask({
      run: () => window.sortieAPI.resetFaceData(),
      onSuccess: () =>
        set({ persons: [], selectedPerson: null, personImages: [], scanResult: null, error: null }),
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
        })),
      onError: (message) => set({ error: message }),
    });
  },
}));
