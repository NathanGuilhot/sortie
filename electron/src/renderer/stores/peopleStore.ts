import { create } from 'zustand';
import { Person, Image, FaceScanProgress, FaceScanResult } from 'shared';

interface PeopleStore {
  persons: Person[];
  selectedPerson: Person | null;
  personImages: Image[];
  loading: boolean;
  error: string | null;
  scanning: boolean;
  scanProgress: FaceScanProgress | null;
  scanResult: FaceScanResult | null;

  fetchPersons: () => Promise<void>;
  selectPerson: (person: Person | null) => void;
  fetchPersonImages: (personId: number, limit?: number, offset?: number) => Promise<void>;
  renamePerson: (personId: number, name: string) => Promise<void>;
  mergePersons: (keepPersonId: number, mergePersonId: number) => Promise<void>;
  splitFace: (faceId: number) => Promise<void>;
  scanFaces: () => Promise<void>;
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

  setError: (error) => set({ error }),
  clearScanResult: () => set({ scanResult: null }),

  fetchPersons: async () => {
    set({ loading: true, error: null });
    try {
      const persons = await window.sortieAPI.getPersons();
      set({ persons, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },

  selectPerson: (person) => {
    set({ selectedPerson: person, personImages: [] });
    if (person) {
      void get().fetchPersonImages(person.id);
    }
  },

  fetchPersonImages: async (personId, limit = 100, offset = 0) => {
    try {
      const images = await window.sortieAPI.getPersonImages(personId, limit, offset);
      set({ personImages: images });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  renamePerson: async (personId, name) => {
    try {
      await window.sortieAPI.renamePerson(personId, name);
      set((state) => ({
        persons: state.persons.map((p) => (p.id === personId ? { ...p, name } : p)),
        selectedPerson:
          state.selectedPerson?.id === personId
            ? { ...state.selectedPerson, name }
            : state.selectedPerson,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  mergePersons: async (keepPersonId, mergePersonId) => {
    try {
      await window.sortieAPI.mergePersons(keepPersonId, mergePersonId);
      await get().fetchPersons();
      const selected = get().selectedPerson;
      if (selected?.id === mergePersonId) {
        set({ selectedPerson: null, personImages: [] });
      } else if (selected?.id === keepPersonId) {
        await get().fetchPersonImages(keepPersonId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  splitFace: async (faceId) => {
    try {
      await window.sortieAPI.splitFaceFromPerson(faceId);
      await get().fetchPersons();
      const selected = get().selectedPerson;
      if (selected) {
        await get().fetchPersonImages(selected.id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  scanFaces: async () => {
    set({ scanning: true, error: null, scanResult: null, scanProgress: { current: 0, total: 0, currentFile: '' } });

    const unsubscribe = window.sortieAPI.onFaceScanProgress((progress) => {
      set({ scanProgress: progress });
    });

    try {
      const result = await window.sortieAPI.processFaces();
      unsubscribe();
      set({ scanning: false, scanProgress: null, scanResult: result });
      await get().fetchPersons();
    } catch (error: unknown) {
      unsubscribe();
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, scanning: false, scanProgress: null });
    }
  },

  resetFaceData: async () => {
    try {
      await window.sortieAPI.resetFaceData();
      set({ persons: [], selectedPerson: null, personImages: [], scanResult: null, error: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  deletePerson: async (personId) => {
    try {
      await window.sortieAPI.deletePerson(personId);
      set((state) => ({
        persons: state.persons.filter((p) => p.id !== personId),
        selectedPerson: state.selectedPerson?.id === personId ? null : state.selectedPerson,
        personImages: state.selectedPerson?.id === personId ? [] : state.personImages,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
}));
