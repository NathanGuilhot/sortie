import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { Toaster } from './components/Toaster';
import { useErrorToastBridge } from './stores/useErrorToastBridge';

function App() {
  useErrorToastBridge();
  const element = useRoutes(routes);
  return (
    <>
      {element}
      <Toaster />
    </>
  );
}

export default App;
