import {
  ArrowLeftRight,
  BarChart3,
  CandlestickChart,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/hooks/useTrader';
import { useLiveStore } from '@/store/live';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const navigation = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/terminal', label: 'Terminal', icon: CandlestickChart },
  { to: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Configurações', icon: Settings2 },
  { to: '/logs', label: 'Logs & auditoria', icon: TerminalSquare },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connected = useLiveStore((state) => state.connected);
  const auth = useAuth();
  const queryClient = useQueryClient();

  const logout = async () => {
    await api.logout();
    await queryClient.invalidateQueries({ queryKey: ['auth'] });
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          'border-line fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col border-r bg-[#080a0e] transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-line flex h-16 items-center justify-between border-b px-5">
          <NavLink to="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="border-acid/30 bg-acid/10 relative grid h-9 w-9 place-items-center rounded-xl border">
              <span className="num text-acid text-sm font-bold">G</span>
              <span className="bg-acid absolute -bottom-1 -right-1 h-2 w-2 rounded-full" />
            </div>
            <div className="leading-none">
              <p className="text-ink text-sm font-bold tracking-[0.16em]">GOODZ</p>
              <p className="text-acid mt-1 text-[9px] font-semibold tracking-[0.34em]">TRADER</p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={onClose}
            className="text-dim hover:bg-panel-2 hover:text-ink rounded-lg p-1.5 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pt-5">
          <div className="border-line bg-panel/60 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <span className="label">Motor</span>
              <span className="text-muted flex items-center gap-1.5 text-[10px]">
                <StatusDot tone={connected ? 'profit' : 'warn'} pulse={connected} />
                {connected ? 'online' : 'offline'}
              </span>
            </div>
            <div className="text-muted mt-2 flex items-center gap-2 text-[11px]">
              <ShieldCheck className="text-acid h-3.5 w-3.5" />
              Risk guard ativo
            </div>
          </div>
        </div>

        <nav className="scroll-thin mt-5 flex-1 space-y-1 overflow-y-auto px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-acid/10 text-acid' : 'text-muted hover:bg-panel-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="bg-acid absolute bottom-2 left-0 top-2 w-0.5 rounded-full" />
                  ) : null}
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-line border-t p-4">
          <div className="text-dim mb-3 flex items-center justify-between text-[10px]">
            <span>v0.1.0</span>
            <span className="num">MEXC FUTURES</span>
          </div>
          {auth.data?.required ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
              onClick={() => void logout()}
            >
              Sair do dashboard
            </Button>
          ) : (
            <p className="text-dim text-[10px] leading-relaxed">
              Acesso local sem senha. Defina <span className="text-muted">AUTH_PASSWORD</span> para
              proteger.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
