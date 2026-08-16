import { useEffect, useState } from 'react';
import { FolderWithStats, OriginFacets, Person } from 'shared';
import { showIpcError } from '../../ipc';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import { usePeopleStore } from '../../stores/peopleStore';

interface SearchFilterData {
  persons: Person[];
  folders: FolderWithStats[];
  origins: OriginFacets;
}

const NO_ORIGINS: OriginFacets = { kinds: [], domains: [] };

export function useSearchFilterData(): SearchFilterData {
  const folders = useFolderStore((state) => state.folderStats);
  const loadFolderStats = useFolderStore((state) => state.loadStats);
  const persons = usePeopleStore((state) => state.persons);
  const fetchPersons = usePeopleStore((state) => state.fetchPersons);
  const [origins, setOrigins] = useState<OriginFacets>(NO_ORIGINS);
  const originDataRevision = useUIStore((state) => state.originDataRevision);

  useEffect(() => {
    void fetchPersons().catch((error) => {
      showIpcError(error, 'Failed to load people');
    });
  }, [fetchPersons]);

  useEffect(() => {
    let active = true;

    void window.sortieAPI
      .getOriginFacets()
      .then((facets) => {
        if (active) setOrigins(facets);
      })
      .catch((error) => {
        showIpcError(error, 'Failed to load image sources');
      });

    return () => {
      active = false;
    };
  }, [originDataRevision]);

  useEffect(() => {
    void loadFolderStats().catch((error) => {
      showIpcError(error, 'Failed to load folders');
    });
  }, [loadFolderStats]);

  return { persons, folders, origins };
}
