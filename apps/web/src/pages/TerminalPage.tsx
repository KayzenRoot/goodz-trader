import {
  BookOpen,
  CandlestickChart,
  Crosshair,
  Layers,
  Radio,
  ScrollText,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { PriceChart } from '@/components/charts/PriceChart';
import { PnlText, SideBadge, TradeStatusBadge } from '@/components/trades/badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBotActions } from '@/hooks/useBotActions';
import {
  useCandles,
  useLogs,
  useMarket,
  useOpenOrders,
  useSettings,
  useStatus,
} from '@/hooks/useTrader';
import {
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPrice,
  fmtRelative,
  fmtSignedPct,
  fmtTime,
} from '@/lib/format';
import { feedLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';

type ChartInterval = 'Min1' | 'Min5' | 'Min15';

export function TerminalPage() {
  const status = useStatus();
  const settings = useSettings();
  const market = useMarket();
  const orders = useOpenOrders();
  const logs = useLogs({ limit: 40 });
  const { closePosition } = useBotActions();
  const [interval, setInterval] = useState<ChartInterval>('Min1');
  const [closeOpen, setCloseOpen] = useState(false);

  const symbol = status?.symbol ?? settings.data?.config.primarySymbol ?? 'BTC_USDT';
  const candles = useCandles(symbol, interval);
  const snapshot = market?.snapshot;
  const position = status?.position ?? null;
  const spread = snapshot?.spreadBps ?? 0;
  const maxSpread = settings.data?.config.risk.maxSpreadBps ?? 8;
  const book = useMemo(() => {
    const bids = (market?.bids ?? []).slice(0, 9);
    const asks = (market?.asks ?? []).slice(0, 9);
    const max = Math.max(1, ...bids.map((level) => level.qty), ...asks.map((level) => level.qty));
    return { bids, asks, max };
  }, [market?.asks, market?.bids]);

  if (!status) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  return (
    <div className="space-y-4" data-testid="terminal-page">
      <Card className="relative overflow-hidden">
        <div className="bg-info/5 pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" dot>
                <StatusDot tone={market?.connected ? 'profit' : 'warn'} pulse={market?.connected} />
                {feedLabel[market?.source ?? 'none']}
                {market?.connected ? ' online' : ' offline'}
              </Badge>
              <Badge variant={spread <= maxSpread ? 'neutral' : 'warn'}>
                spread {fmtNumber(spread, 1)} bps
              </Badge>
              <span className="num text-dim text-[10px]">{symbol}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="num text-ink text-4xl font-semibold tracking-tight">
                {fmtPrice(snapshot?.last ?? null)}
              </p>
              <div className="flex items-center gap-1.5 pb-1 text-xs">
                <span
                  className={cn(
                    'num',
                    (snapshot?.tradeDelta ?? 0) >= 0 ? 'text-profit' : 'text-loss',
                  )}
                >
                  flow {fmtSignedPct((snapshot?.tradeDelta ?? 0) * 100)}
                </span>
                <span className="text-dim">·</span>
                <span className="num text-muted">
                  vol {fmtNumber(snapshot?.volatilityBps ?? 0, 1)} bps
                </span>
              </div>
            </div>
            <p className="text-dim mt-1 text-[10px]">
              bid {fmtPrice(snapshot?.bid ?? null)} · ask {fmtPrice(snapshot?.ask ?? null)} ·
              latência {market?.latencyMs ?? '—'}ms · último tick {fmtRelative(market?.lastTickAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-line bg-panel-2/70 rounded-xl border px-3 py-2">
              <p className="label">Book imbalance</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="bg-white/6 h-1.5 w-28 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      (snapshot?.imbalance ?? 0) >= 0 ? 'bg-profit' : 'bg-loss',
                    )}
                    style={{ width: `${Math.abs(snapshot?.imbalance ?? 0) * 100}%` }}
                  />
                </div>
                <span className="num text-ink text-xs">
                  {fmtSignedPct((snapshot?.imbalance ?? 0) * 100, 0)}
                </span>
              </div>
            </div>
            {position ? (
              <Button
                variant="danger"
                onClick={() => setCloseOpen(true)}
                loading={closePosition.isPending}
              >
                Fechar posição
              </Button>
            ) : (
              <Badge variant="neutral">sem posição</Badge>
            )}
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader
            title="Gráfico"
            description="Candles e níveis da posição atual."
            eyebrow="Market"
            icon={<CandlestickChart className="h-4 w-4" />}
            action={
              <div className="flex items-center gap-2">
                <Badge variant={candles.data?.source === 'mexc' ? 'neutral' : 'warn'}>
                  {candles.data?.source ?? '...'}
                </Badge>
                <SegmentedControl
                  size="sm"
                  value={interval}
                  onChange={setInterval}
                  options={[
                    { value: 'Min1', label: '1m' },
                    { value: 'Min5', label: '5m' },
                    { value: 'Min15', label: '15m' },
                  ]}
                />
              </div>
            }
          />
          <CardBody className="pt-2">
            {candles.isLoading ? (
              <Skeleton className="h-[390px] w-full" />
            ) : (
              <PriceChart candles={candles.data?.candles ?? []} position={position} height={390} />
            )}
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader
              title="Order book"
              description="Topo do livro e liquidez."
              eyebrow="Depth"
              icon={<BookOpen className="h-4 w-4" />}
            />
            <CardBody className="pt-3">
              <div className="space-y-0.5">
                {[...book.asks].reverse().map((level, index) => (
                  <BookRow
                    key={`ask-${level.price}-${index}`}
                    side="ask"
                    price={level.price}
                    qty={level.qty}
                    max={book.max}
                  />
                ))}
                <div className="border-line my-1.5 flex items-center justify-between border-y py-1.5">
                  <span className="num text-muted text-[11px]">
                    {fmtPrice(snapshot?.mid ?? null)}
                  </span>
                  <span className="text-dim text-[9px] uppercase tracking-wider">spread</span>
                  <span className="num text-warn text-[10px]">{fmtNumber(spread, 1)} bps</span>
                </div>
                {book.bids.map((level, index) => (
                  <BookRow
                    key={`bid-${level.price}-${index}`}
                    side="bid"
                    price={level.price}
                    qty={level.qty}
                    max={book.max}
                  />
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Tape"
              description="Agressão recente."
              eyebrow="Flow"
              icon={<Radio className="h-4 w-4" />}
            />
            <CardBody className="pt-2">
              <div className="scroll-thin max-h-[228px] space-y-0.5 overflow-y-auto">
                {(market?.tape ?? [])
                  .slice(-18)
                  .reverse()
                  .map((print, index) => (
                    <div
                      key={`${print.ts}-${index}`}
                      className="grid grid-cols-[52px_1fr_64px] items-center gap-2 py-1 text-[10px]"
                    >
                      <span className="num text-dim">{fmtTime(print.ts)}</span>
                      <span
                        className={cn(
                          'num text-right',
                          print.side === 'buy' ? 'text-profit' : 'text-loss',
                        )}
                      >
                        {fmtPrice(print.price)}
                      </span>
                      <span className="num text-muted text-right">{fmtNumber(print.qty, 3)}</span>
                    </div>
                  ))}
                {!market?.tape?.length ? (
                  <p className="text-dim py-6 text-center text-[11px]">Aguardando trades...</p>
                ) : null}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardBody className="pt-4">
          <Tabs defaultValue={position ? 'position' : 'orders'}>
            <TabsList>
              <TabsTrigger value="position">
                <Crosshair className="h-3.5 w-3.5" /> Posição
              </TabsTrigger>
              <TabsTrigger value="orders">
                <Layers className="h-3.5 w-3.5" /> Ordens
              </TabsTrigger>
              <TabsTrigger value="logs">
                <ScrollText className="h-3.5 w-3.5" /> Logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="position" className="pt-4">
              {position ? (
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <SideBadge side={position.side} />
                        <div>
                          <p className="num text-ink text-base font-semibold">{position.symbol}</p>
                          <p className="text-dim text-[10px]">
                            {position.id} · aberta {fmtRelative(position.openedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <PnlText value={position.unrealizedPnl} className="text-lg" />
                        <p
                          className={cn(
                            'num text-[10px]',
                            position.unrealizedPct >= 0 ? 'text-profit' : 'text-loss',
                          )}
                        >
                          {fmtSignedPct(position.unrealizedPct)} da margem
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <PosMetric label="Entrada" value={fmtPrice(position.entryPrice)} />
                      <PosMetric label="Mark" value={fmtPrice(position.markPrice)} />
                      <PosMetric label="Stop" value={fmtPrice(position.stopPrice)} tone="loss" />
                      <PosMetric
                        label="Take"
                        value={fmtPrice(position.takeProfitPrice)}
                        tone="profit"
                      />
                      <PosMetric label="Notional" value={fmtMoney(position.notionalUsd)} />
                      <PosMetric label="Margem" value={fmtMoney(position.marginUsd)} />
                      <PosMetric label="Qtd" value={fmtNumber(position.qty, 4)} />
                      <PosMetric
                        label="Trailing"
                        value={
                          position.trailingStopPrice ? fmtPrice(position.trailingStopPrice) : '—'
                        }
                      />
                    </div>
                  </div>
                  <div className="border-line bg-panel-2/60 rounded-xl border p-4">
                    <div className="text-muted flex items-center gap-2 text-xs">
                      <ShieldAlert className="text-warn h-4 w-4" />
                      Saída gerenciada
                    </div>
                    <p className="text-dim mt-2 text-[11px] leading-relaxed">
                      TP, SL, trailing e time stop são avaliados a cada tick. O bot fecha a mercado
                      e registra taxa taker + slippage no ledger.
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className="text-dim">Tempo máximo</span>
                      <span className="num text-ink">
                        {settings.data?.config.strategy.timeStopSec ?? '—'}s
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-dim">Aberta há</span>
                      <span className="num text-ink">
                        {fmtDuration((Date.now() - position.openedAt) / 1_000)}
                      </span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      className="mt-4 w-full"
                      leftIcon={<X className="h-3.5 w-3.5" />}
                      onClick={() => setCloseOpen(true)}
                    >
                      Fechar a mercado
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Crosshair className="h-6 w-6" />}
                  title="Flat"
                  description="O motor está sem posição. A próxima entrada aparece aqui quando o setup e o risk guard permitirem."
                />
              )}
            </TabsContent>

            <TabsContent value="orders" className="pt-4">
              {orders.data?.items.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Criada</TH>
                      <TH>Par</TH>
                      <TH>Lado</TH>
                      <TH>Tipo</TH>
                      <TH className="text-right">Preço</TH>
                      <TH className="text-right">Qtd</TH>
                      <TH className="text-right">Preenchido</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {orders.data.items.map((order) => (
                      <TR key={order.id}>
                        <TD className="num text-dim">{fmtTime(order.createdAt)}</TD>
                        <TD className="num text-ink">{order.symbol}</TD>
                        <TD>
                          <SideBadge side={order.side} />
                        </TD>
                        <TD className="uppercase">{order.type}</TD>
                        <TD className="num text-right">
                          {order.price ? fmtPrice(order.price) : 'market'}
                        </TD>
                        <TD className="num text-right">{fmtNumber(order.qty, 4)}</TD>
                        <TD className="num text-right">{fmtNumber(order.filledQty, 4)}</TD>
                        <TD>
                          <TradeStatusBadge
                            status={
                              order.status === 'open'
                                ? 'open'
                                : order.status === 'pending'
                                  ? 'pending'
                                  : order.status === 'rejected'
                                    ? 'rejected'
                                    : 'closed'
                            }
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<Layers className="h-6 w-6" />}
                  title="Sem ordens abertas"
                  description="Ordens maker pendentes ou parcialmente preenchidas aparecem aqui."
                />
              )}
            </TabsContent>

            <TabsContent value="logs" className="pt-4">
              <div className="scroll-thin max-h-[320px] space-y-1 overflow-y-auto font-mono text-[10px]">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="hover:bg-panel-2/50 grid grid-cols-[62px_46px_1fr] gap-2 rounded px-1 py-1"
                  >
                    <span className="text-dim">{fmtTime(log.ts)}</span>
                    <span
                      className={cn(
                        'uppercase',
                        log.level === 'error'
                          ? 'text-loss'
                          : log.level === 'warn'
                            ? 'text-warn'
                            : log.level === 'debug'
                              ? 'text-dim'
                              : 'text-info',
                      )}
                    >
                      {log.level}
                    </span>
                    <span className="text-muted">
                      <span className="text-dim">[{log.category}]</span> {log.message}
                    </span>
                  </div>
                ))}
                {logs.length === 0 ? <p className="text-dim py-8 text-center">Sem logs.</p> : null}
              </div>
            </TabsContent>
          </Tabs>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Fechar posição a mercado?"
        description="A execução paga taxa taker e pode sofrer slippage. O bot continua ativo."
        confirmLabel="Fechar agora"
        loading={closePosition.isPending}
        onConfirm={() => closePosition.mutate(undefined, { onSettled: () => setCloseOpen(false) })}
      />
    </div>
  );
}

function BookRow({
  side,
  price,
  qty,
  max,
}: {
  side: 'bid' | 'ask';
  price: number;
  qty: number;
  max: number;
}) {
  const width = Math.max(3, Math.min(100, (qty / max) * 100));
  return (
    <div className="relative grid grid-cols-[1fr_auto] items-center gap-2 px-1 py-[3px] text-[10px]">
      <div
        className={cn(
          'absolute inset-y-0 right-0 rounded-l-sm opacity-[0.08]',
          side === 'bid' ? 'bg-profit' : 'bg-loss',
        )}
        style={{ width: `${width}%` }}
      />
      <span className={cn('num relative z-10', side === 'bid' ? 'text-profit' : 'text-loss')}>
        {fmtPrice(price)}
      </span>
      <span className="num text-muted relative z-10 text-right">{fmtNumber(qty, 2)}</span>
    </div>
  );
}

function PosMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="border-line bg-panel-2/60 rounded-lg border p-2.5">
      <p className="text-dim text-[9px] uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'num mt-0.5 text-[11px] font-semibold',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}
