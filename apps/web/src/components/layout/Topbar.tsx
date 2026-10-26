import type { BotStatus } from '@goodz/core';
import { AlertTriangle, ChevronRight, Menu, OctagonX, Play, Power, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusDot } from '@/components/ui/status-dot';
import { Switch } from '@/components/ui/switch';
import { useBotActions } from '@/hooks/useBotActions';
import { useMarket, useSettings, useStatus } from '@/hooks/useTrader';
import { fmtPrice, fmtSignedMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const titles: Record<string, string> = {
  '/': 'Visão geral',
  '/terminal': 'Terminal',
  '/trades': 'Trades',
  '/analytics': 'Analytics',
  '/settings': 'Configurações',
  '/logs': 'Logs & auditoria',
};

const statusLabel: Record<BotStatus, string> = {
  idle: 'Aguardando',
  starting: 'Iniciando',
  running: 'Em execução',
  stopping: 'Parando',
  stopped: 'Parado',
  halted: 'Pausado',
  error: 'Erro',
};

const statusTone: Record<BotStatus, 'profit' | 'loss' | 'warn' | 'info' | 'muted' | 'acid'> = {
  idle: 'muted',
  starting: 'info',
  running: 'profit',
  stopping: 'warn',
  stopped: 'muted',
  halted: 'warn',
  error: 'loss',
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const status = useStatus();
  const settings = useSettings();
  const market = useMarket();
  const { start, stop, kill } = useBotActions();
  const [clock, setClock] = useState(() => new Date());
  const [stopOpen, setStopOpen] = useState(false);
  const [closeOnStop, setCloseOnStop] = useState(true);
  const [killOpen, setKillOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pulse, setPulse] = useState<'up' | 'down' | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const price = market?.snapshot?.last ?? null;
  useEffect(() => {
    if (price === null) return;
    if (previousPrice !== null && price !== previousPrice) {
      setPulse(price > previousPrice ? 'up' : 'down');
      const timeout = setTimeout(() => setPulse(null), 450);
      setPreviousPrice(price);
      return () => clearTimeout(timeout);
    }
    setPreviousPrice(price);
  }, [price, previousPrice]);

  const running = status?.status === 'running' || status?.status === 'starting';
  const halted = status?.status === 'halted';
  const killSwitch = settings.data?.config.execution.killSwitch ?? false;
  const liveMode = settings.data?.config.mode === 'live';
  const dayPnl = status?.dayPnl ?? 0;
  const title = titles[location.pathname] ?? 'Goodz Trader';
  const startBlocked = killSwitch || !status || !settings.data;
  const liveDisabled = liveMode && !settings.data?.liveTradingEnabled;

  const doStart = () => {
    if (liveMode) {
      setStartOpen(true);
      return;
    }
    start.mutate(undefined);
  };

  return (
    <>
      <header className="border-line bg-void/85 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
        <button
          type="button"
          className="text-muted hover:bg-panel-2 hover:text-ink rounded-lg p-1.5 lg:hidden"
          onClick={onMenu}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="text-dim flex items-center gap-1.5 text-[10px]">
            <span>GOODZ</span>
            <ChevronRight className="h-2.5 w-2.5" />
            <span className="truncate">{title}</span>
          </div>
          <h1 className="text-ink truncate text-sm font-semibold tracking-tight">{title}</h1>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="border-line bg-panel/70 hidden items-center gap-2 rounded-xl border px-3 py-1.5 md:flex">
            <span className="text-dim text-[10px] font-semibold tracking-wider">
              {status?.symbol ?? 'BTC_USDT'}
            </span>
            <span
              className={cn(
                'num text-sm font-semibold transition-colors',
                pulse === 'up' ? 'text-profit' : pulse === 'down' ? 'text-loss' : 'text-ink',
              )}
            >
              {fmtPrice(price)}
            </span>
          </div>

          <div className="hidden flex-col items-end sm:flex">
            <span className="text-dim text-[9px] uppercase tracking-[0.14em]">PnL do dia</span>
            <span
              className={cn('num text-xs font-semibold', dayPnl >= 0 ? 'text-profit' : 'text-loss')}
            >
              {fmtSignedMoney(dayPnl)}
            </span>
          </div>

          <div className="border-line bg-panel/60 hidden items-center gap-2 rounded-xl border px-2.5 py-1.5 lg:flex">
            <StatusDot
              tone={statusTone[status?.status ?? 'stopped']}
              pulse={status?.status === 'running'}
            />
            <span className="text-muted text-[11px] font-medium">
              {statusLabel[status?.status ?? 'stopped']}
            </span>
            <Badge variant={liveMode ? 'loss' : 'info'} className="px-1.5 py-0.5 text-[9px]">
              {liveMode ? 'REAL' : 'PAPER'}
            </Badge>
          </div>

          <div className="hidden text-right md:block">
            <p className="num text-muted text-xs font-medium">
              {clock.toLocaleTimeString('pt-BR', { hour12: false })}
            </p>
            <p className="text-dim text-[9px] uppercase tracking-wider">
              {clock.toLocaleDateString('pt-BR')}
            </p>
          </div>

          {running ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Square className="h-3.5 w-3.5 fill-current" />}
              onClick={() => setStopOpen(true)}
              data-testid="stop-bot"
            >
              Parar
            </Button>
          ) : (
            <Button
              variant={halted ? 'secondary' : 'primary'}
              size="sm"
              leftIcon={<Play className="h-3.5 w-3.5 fill-current" />}
              disabled={startBlocked || liveDisabled}
              loading={start.isPending}
              onClick={doStart}
              data-testid="start-bot"
            >
              {halted ? 'Retomar' : 'Iniciar'}
            </Button>
          )}

          <Button
            variant="danger"
            size="icon"
            aria-label="Kill switch"
            title="Kill switch: para o bot e tenta fechar a posição"
            onClick={() => setKillOpen(true)}
            disabled={status?.status === 'stopped' && !status.position}
          >
            <OctagonX className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {killSwitch ? (
        <div className="border-warn/20 bg-warn/10 text-warn flex items-center gap-2 border-b px-4 py-2 text-[11px] sm:px-6">
          <AlertTriangle className="h-3.5 w-3.5" />
          Kill switch ativo. O bot não inicia até ser desativado em Configurações.
        </div>
      ) : null}
      {liveDisabled ? (
        <div className="border-loss/20 bg-loss/10 text-loss flex items-center gap-2 border-b px-4 py-2 text-[11px] sm:px-6">
          <AlertTriangle className="h-3.5 w-3.5" />
          Modo REAL selecionado, mas LIVE_TRADING_ENABLED=false no servidor. Apenas paper trading
          está disponível.
        </div>
      ) : null}

      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Parar o bot?"
        description="Novas entradas serão bloqueadas. Escolha se a posição aberta deve ser encerrada a mercado."
        confirmLabel="Parar bot"
        loading={stop.isPending}
        onConfirm={() => {
          stop.mutate(closeOnStop, { onSettled: () => setStopOpen(false) });
        }}
      >
        <div className="border-line bg-panel-2/60 rounded-xl border px-3">
          <Switch
            checked={closeOnStop}
            onChange={setCloseOnStop}
            label="Fechar posição aberta"
            description="Recomendado. A saída usa ordem a mercado e paga taxa taker."
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={killOpen}
        onOpenChange={setKillOpen}
        title="Acionar kill switch?"
        description="O bot será pausado, ordens pendentes canceladas e a posição atual será encerrada a mercado quando possível. O kill switch ficará ativo até você desativá-lo."
        confirmLabel="Acionar e parar tudo"
        loading={kill.isPending}
        onConfirm={() => kill.mutate(undefined, { onSettled: () => setKillOpen(false) })}
      >
        <div className="border-loss/20 bg-loss/5 text-loss flex items-start gap-2 rounded-xl border p-3 text-[11px]">
          <Power className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Use apenas em emergência. Se o fechamento falhar, feche manualmente na MEXC.
        </div>
      </ConfirmDialog>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar trading real</DialogTitle>
            <DialogDescription>
              Esta ação envia ordens com dinheiro real para a MEXC Futures. Confirme que você
              revisou alavancagem, stop diário e tamanho de posição.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="border-loss/25 bg-loss/5 text-loss rounded-xl border p-3 text-[11px] leading-relaxed">
              O bot pode abrir muitas ordens rapidamente e alavancagem amplifica perdas. Não existe
              garantia de lucro. Comece com notional mínimo e valide o modo paper.
            </div>
            <div className="space-y-1.5">
              <p className="text-muted text-xs">
                Digite <span className="num text-ink">{settings.data?.confirmationPhrase}</span>{' '}
                para confirmar
              </p>
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={settings.data?.confirmationPhrase}
                autoComplete="off"
                data-testid="live-confirmation"
              />
            </div>
            {!settings.data?.liveTradingEnabled ? (
              <p className="text-warn text-[11px]">
                O servidor está com LIVE_TRADING_ENABLED=false. Ative essa variável e reinicie antes
                de tentar novamente.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={
                confirmation.trim() !== settings.data?.confirmationPhrase ||
                !settings.data?.liveTradingEnabled
              }
              loading={start.isPending}
              onClick={() =>
                start.mutate(confirmation, {
                  onSuccess: () => {
                    setStartOpen(false);
                    setConfirmation('');
                  },
                })
              }
            >
              Iniciar com dinheiro real
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
