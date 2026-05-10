import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/layout';

const Models = lazy(() => import('./pages/models').then(m => ({ default: m.Models })));
const Agents = lazy(() => import('./pages/agents').then(m => ({ default: m.Agents })));
const Skills = lazy(() => import('./pages/skills').then(m => ({ default: m.Skills })));
const Sessions = lazy(() => import('./pages/sessions').then(m => ({ default: m.Sessions })));
const SessionList = lazy(() => import('./pages/session-list').then(m => ({ default: m.SessionList })));
const Progress = lazy(() => import('./pages/progress').then(m => ({ default: m.Progress })));
const UserProfile = lazy(() => import('./pages/user-profile').then(m => ({ default: m.UserProfile })));

function PageLoader() {
  return (
    <div className="page-loader" aria-label="Loading page">
      <div className="page-loader-spinner" />
    </div>
  );
}

function LazyPage({ Component }: { Component: React.ComponentType }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <div className="fade-in">
        <Component />
      </div>
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LazyPage Component={SessionList} /> },
      { path: '/sessions', element: <LazyPage Component={Sessions} /> },
      { path: '/models', element: <LazyPage Component={Models} /> },
      { path: '/agents', element: <LazyPage Component={Agents} /> },
      { path: '/skills', element: <LazyPage Component={Skills} /> },
      { path: '/progress', element: <LazyPage Component={Progress} /> },
      { path: '/profile', element: <LazyPage Component={UserProfile} /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
