import { useEffect, useState } from 'react';
import { FolderWithStats, Person } from 'shared';
import { showIpcError } from '../../ipc';
import { useFolderStore } from '../../stores/folderStore';

interface SearchFilterData {
  persons: Person[];
  folders: FolderWithStats[];
}

export function useSearchFilterData(): SearchFilterData {
  const folders = useFolderStore((state) => state.folderStats);
  const loadFolderStats = useFolderStore((state) => state.loadStats);
  const [persons, setPersons] = useState<Person[]>([]);

  useEffect(() => {
    let active = true;

    void window.sortieAPI
      .getPersons()
      .then((nextPersons) => {
        if (active) setPersons(nextPersons);
      })
      .catch((error) => {
        showIpcError(error, 'Failed to load people');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadFolderStats().catch((error) => {
      showIpcError(error, 'Failed to load folders');
    });
  }, [loadFolderStats]);

  return { persons, folders };
}
