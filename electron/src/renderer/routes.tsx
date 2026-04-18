import { Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { GalleryScreen } from './screens/GalleryScreen';
import { FoldersScreen } from './screens/FoldersScreen';
import { CleanupScreen } from './screens/CleanupScreen';
import { PeopleScreen } from './screens/PeopleScreen';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/gallery" replace /> },
      { path: 'gallery', element: <GalleryScreen /> },
      { path: 'folders', element: <FoldersScreen /> },
      { path: 'cleanup', element: <CleanupScreen /> },
      { path: 'people', element: <PeopleScreen /> },
      { path: '*', element: <Navigate to="/gallery" replace /> },
    ],
  },
];
