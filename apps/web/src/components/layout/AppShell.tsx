import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useLiveSocket } from '@/hooks/useLiveSocket';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  useLiveSocket();

  useEffect(() => {
    const onUnauthorized = () => {
      void queryClient.invalidateQueries({ queryKey: ['auth'] });
    };
    window.addEventListener('goodz:unauthorized', onUnauthorized);
    return () => window.removeEventListener('goodz:unauthorized', onUnauthorized);
  }, [queryClient]);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="min-w-0 flex-1">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-[1640px] p-4 sm:p-6">
          <Outlet />
        </main>
        <footer className="text-dim mx-auto flex w-full max-w-[1640px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[10px] sm:px-6">
          <span>Goodz Trader · paper first, risk always</span>
          <span className="num">MEXC Futures · não é aconselhamento financeiro</span>
        </footer>
      </div>
    </div>
  );
}
