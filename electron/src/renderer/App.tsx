import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { Toaster } from './components/Toaster';
import { OnboardingTakeover } from './components/OnboardingTakeover';
import { useErrorToastBridge } from './stores/useErrorToastBridge';
import { useFolderStore } from './stores/folderStore';
import { useOnboardingStore } from './stores/onboardingStore';

function App() {
  useErrorToastBridge();
  const loadFolders = useFolderStore((s) => s.load);
  const loadOnboarding = useOnboardingStore((s) => s.load);
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
