import { Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { GalleryScreen } from './screens/GalleryScreen';
import { BoardsIndexScreen } from './screens/BoardsIndexScreen';
import { BoardDetailScreen } from './screens/BoardDetailScreen';
import { ImportScreen } from './screens/ImportScreen';
import { PeopleScreen } from './components/PeopleScreen';
import { CleanupScreen } from './components/CleanupScreen';
import { FolderScanner } from './components/FolderScanner';

const wrap = (node: React.ReactNode) => <main className="flex-1 overflow-hidden">{node}</main>;

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/gallery" replace /> },
      { path: 'gallery', element: <GalleryScreen /> },
      { path: 'boards', element: <BoardsIndexScreen /> },
      { path: 'boards/:id', element: <BoardDetailScreen /> },
      { path: 'folders', element: wrap(<FolderScanner />) },
      { path: 'import', element: <ImportScreen /> },
      { path: 'cleanup', element: wrap(<CleanupScreen />) },
      { path: 'people', element: wrap(<PeopleScreen />) },
      { path: '*', element: <Navigate to="/gallery" replace /> },
    ],
  },
];
