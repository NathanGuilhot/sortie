import { Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { GalleryScreen } from './screens/GalleryScreen';
import { FoldersScreen } from './screens/FoldersScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { BoardsIndexScreen } from './screens/BoardsIndexScreen';
import { BoardDetailScreen } from './screens/BoardDetailScreen';
import { ImportScreen } from './screens/ImportScreen';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/gallery" replace /> },
      { path: 'gallery', element: <GalleryScreen /> },
      { path: 'boards', element: <BoardsIndexScreen /> },
      { path: 'boards/:id', element: <BoardDetailScreen /> },
      { path: 'folders', element: <FoldersScreen /> },
      { path: 'import', element: <ImportScreen /> },
      // { path: 'cleanup', element: <CleanupScreen /> }, // Disabled until we have a better duplicate algorithm
      { path: 'people', element: <PeopleScreen /> },
      { path: '*', element: <Navigate to="/gallery" replace /> },
    ],
  },
];
