import { useEffect, useState } from 'react';
import { FolderWithStats, OriginFacets } from 'shared';
import { showIpcError } from '../../ipc';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';

interface SearchFilterData {
  folders: FolderWithStats[];
  origins: OriginFacets;
}

const NO_ORIGINS: OriginFacets = { kinds: [], domains: [] };

export function useSearchFilterData(): SearchFilterData {
  const folders = useFolderStore((state) => state.folderStats);
  const loadFolderStats = useFolderStore((state) => state.loadStats);
  const [origins, setOrigins] = useState<OriginFacets>(NO_ORIGINS);
  const originDataRevision = useUIStore((state) => state.originDataRevision);

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

  return { folders, origins };
}
