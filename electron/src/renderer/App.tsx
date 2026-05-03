import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { Toaster } from './components/Toaster';
import { OnboardingTakeover } from './components/OnboardingTakeover';
import { useErrorToastBridge } from './stores/useErrorToastBridge';
import { useFolderStore } from './stores/folderStore';
import { useOnboardingStore } from './stores/onboardingStore';
import { useImageStore } from './stores/imageStore';
import { usePinterestImportStore } from './stores/pinterestImportStore';
import { useUIStore } from './stores/uiStore';

function App() {
  useErrorToastBridge();
  const loadFolders = useFolderStore((s) => s.load);
  const loadOnboarding = useOnboardingStore((s) => s.load);
  const clearFilters = useUIStore((s) => s.clearFilters);
  const clearImageQuery = useImageStore((s) => s.clearImageQuery);
  const resetPinterestImport = usePinterestImportStore((s) => s.reset);

  useEffect(() => {
    clearFilters();
    clearImageQuery();
    resetPinterestImport();
  }, [clearFilters, clearImageQuery, resetPinterestImport]);

  useEffect(() => {
    void loadFolders();
    void loadOnboarding();
  }, [loadFolders, loadOnboarding]);
  const element = useRoutes(routes);
  return (
    <>
      {element}
      <OnboardingTakeover />
      <Toaster />
    </>
  );
}

export default App;
