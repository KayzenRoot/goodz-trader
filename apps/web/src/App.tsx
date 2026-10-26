import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { Skeleton } from '@/components/ui/skeleton';

const OverviewPage = lazy(() =>
  import('@/pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
);
const TerminalPage = lazy(() =>
  import('@/pages/TerminalPage').then((module) => ({ default: module.TerminalPage })),
);
const TradesPage = lazy(() =>
  import('@/pages/TradesPage').then((module) => ({ default: module.TradesPage })),
);
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const LogsPage = lazy(() =>
  import('@/pages/LogsPage').then((module) => ({ default: module.LogsPage })),
);

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<ProtectedShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <OverviewPage />
            </Suspense>
          }
        />
        <Route
          path="terminal"
          element={
            <Suspense fallback={<PageFallback />}>
              <TerminalPage />
            </Suspense>
          }
        />
        <Route
          path="trades"
          element={
            <Suspense fallback={<PageFallback />}>
              <TradesPage />
            </Suspense>
          }
        />
        <Route
          path="analytics"
          element={
            <Suspense fallback={<PageFallback />}>
              <AnalyticsPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageFallback />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="logs"
          element={
            <Suspense fallback={<PageFallback />}>
              <LogsPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
