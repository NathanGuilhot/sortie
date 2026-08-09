import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { Toaster } from './components/Toaster';
import { ExternalImportBridge } from './components/ExternalImportBridge';
import { OnboardingTakeover } from './components/OnboardingTakeover';
import { useErrorToastBridge } from './stores/useErrorToastBridge';
import { useFolderStore } from './stores/folderStore';
import { useOnboardingStore } from './stores/onboardingStore';
import { useImageStore } from './stores/imageStore';
import { usePinterestImportStore } from './stores/pinterestImportStore';

function App() {
  useErrorToastBridge();
  const loadFolders = useFolderStore((s) => s.load);
  const loadOnboarding = useOnboardingStore((s) => s.load);
  const clearImageQuery = useImageStore((s) => s.clearImageQuery);
  const resetPinterestImport = usePinterestImportStore((s) => s.reset);

  useEffect(() => {
    clearImageQuery();
    resetPinterestImport();
  }, [clearImageQuery, resetPinterestImport]);

  useEffect(() => {
    void loadFolders();
    void loadOnboarding();
  }, [loadFolders, loadOnboarding]);
  const element = useRoutes(routes);
  return (
    <>
      {element}
      <ExternalImportBridge />
      <OnboardingTakeover />
      <Toaster />
    </>
  );
}

export default App;
