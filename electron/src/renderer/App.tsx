import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { Toaster } from './components/Toaster';
import { useErrorToastBridge } from './stores/useErrorToastBridge';
import { useFolderStore } from './stores/folderStore';

function App() {
  useErrorToastBridge();
  const loadFolders = useFolderStore((s) => s.load);
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);
  const element = useRoutes(routes);
  return (
    <>
      {element}
      <Toaster />
    </>
  );
}

export default App;
