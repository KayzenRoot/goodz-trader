import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Crosshair,
  Gauge,
  Layers3,
  Percent,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EquityChart } from '@/components/charts/EquityChart';
import { PnlBars } from '@/components/charts/PnlBars';
import { AlertCenter } from '@/components/overview/AlertCenter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat';
import { StatusDot } from '@/components/ui/status-dot';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { DemoBadge, PnlText, SideBadge, TradeStatusBadge } from '@/components/trades/badges';
import { useBotActions } from '@/hooks/useBotActions';
import { useMarket, useMetrics, useSettings, useStatus, useTrades } from '@/hooks/useTrader';
import {
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtRelative,
  fmtSignedMoney,
  fmtSignedPct,
} from '@/lib/format';
import { botStatusLabel, botStatusTone, feedLabel, haltReasonLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live';

export function OverviewPage() {
  const status = useStatus();
  const metrics = useMetrics(30);
  const settings = useSettings();
  const market = useMarket();
  const trades = useTrades({ limit: 8 });
  const socketConnected = useLiveStore((state) => state.connected);
  const { closePosition } = useBotActions();
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('30d');
  const [closeOpen, setCloseOpen] = useState(false);

  const config = settings.data?.config;
  const summary = metrics.data?.summary;
  const position = status?.position;
  const dayPnl = status?.dayPnl ?? 0;
  const equity = status?.equity ?? 0;
  const target = config?.daily.profitTargetUsd ?? 0;
  const lossLimit = config?.daily.lossLimitUsd ?? 0;
  const remainingTarget = Math.max(0, target - dayPnl);
  const remainingLoss = Math.max(0, lossLimit + dayPnl);
  const spread = market?.snapshot?.spreadBps ?? 0;

  const equitySeries = useMemo(() => {
    const data = metrics.data?.equity ?? [];
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    const since = Date.now() - days * 86_400_000;
    const filtered = data.filter((point) => point.ts >= since);
    return filtered.length > 1 ? filtered : data;
  }, [metrics.data?.equity, range]);

  const rangeReturn = useMemo(() => {
    if (equitySeries.length < 2) return 0;
    const first = equitySeries[0]?.equity ?? 0;
    const last = equitySeries.at(-1)?.equity ?? 0;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [equitySeries]);

  if (!status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const feed = status.feed;
  const running = status.status === 'running';
  const winRate = summary?.winRate ?? 0;
  const profitFactor = summary?.profitFactor ?? 0;

  return (
    <div className="space-y-5" data-testid="overview-page">
      <section className="border-line bg-panel/95 relative overflow-hidden rounded-2xl border">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="bg-acid/6 pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.mode === 'live' ? 'loss' : 'info'} dot>
                  {status.mode === 'live' ? 'Live trading' : 'Paper trading'}
                </Badge>
                <Badge
                  variant={
                    status.status === 'running'
                      ? 'profit'
                      : status.status === 'halted'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  <StatusDot tone={botStatusTone[status.status]} pulse={running} />
                  {botStatusLabel[status.status]}
                </Badge>
                {status.demoData ? <DemoBadge /> : null}
                <span className="num text-dim text-[10px]">{status.symbol}</span>
              </div>

              <p className="label mt-5">
                {status.mode === 'live' ? 'Equity MEXC' : 'Equity paper'}
              </p>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="num text-ink text-4xl font-semibold tracking-tight sm:text-5xl">
                  {fmtMoney(equity)}
                </p>
                <div
                  className={cn(
                    'mb-1 flex items-center gap-1.5 text-sm font-semibold',
                    dayPnl >= 0 ? 'text-profit' : 'text-loss',
                  )}
                >
                  {dayPnl >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span className="num">{fmtSignedMoney(dayPnl)}</span>
                  <span className="num text-xs opacity-80">({fmtSignedPct(status.dayPnlPct)})</span>
                </div>
              </div>
              <p className="text-muted mt-2 text-[11px]">
                {status.mode === 'live' ? 'Saldo disponível' : 'Saldo virtual'}{' '}
                {fmtMoney(status.availableBalance)} · {status.tradesDay} trades hoje ·{' '}
                {fmtNumber(status.winsDay, 0)}W / {fmtNumber(status.lossesDay, 0)}L
              </p>

              {status.haltReason ? (
                <div className="border-warn/25 bg-warn/10 text-warn mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {haltReasonLabel[status.haltReason]}
                </div>
              ) : null}
              {status.lastError ? (
                <div className="border-loss/20 bg-loss/5 text-loss mt-3 flex max-w-2xl items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {status.lastError}
                </div>
              ) : null}
            </div>

            <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
              <GuardProgress
                icon={<Target className="h-4 w-4" />}
                label="Meta diária"
                value={fmtMoney(dayPnl)}
                hint={`${fmtMoney(target)} · faltam ${fmtMoney(remainingTarget)}`}
                progress={status.targetProgress}
                tone="profit"
              />
              <GuardProgress
                icon={<ShieldAlert className="h-4 w-4" />}
                label="Stop diário"
                value={fmtMoney(Math.max(0, -dayPnl))}
                hint={`limite ${fmtMoney(lossLimit)} · margem ${fmtMoney(remainingLoss)}`}
                progress={status.lossProgress}
                tone="loss"
              />
              <div className="border-line bg-panel-2/70 rounded-xl border p-3.5 sm:col-span-2">
                <div className="text-dim flex items-center justify-between text-[10px]">
                  <span className="label">Exposição do dia</span>
                  <span className="num">
                    {status.tradesDay}/{config?.risk.maxTradesPerDay ?? '—'} trades
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-3">
                  <MiniMetric label="Meta" value={fmtMoney(target)} />
                  <MiniMetric label="Stop" value={fmtMoney(lossLimit)} />
                  <MiniMetric label="Alavancagem" value={`${config?.leverage ?? '—'}x`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={feed.connected ? 'profit' : 'warn'} dot>
                    {feedLabel[feed.source]} {feed.connected ? 'online' : 'offline'}
                  </Badge>
                  <Badge variant={spread <= (config?.risk.maxSpreadBps ?? 8) ? 'neutral' : 'warn'}>
                    spread {fmtNumber(spread, 1)} bps
                  </Badge>
                  <Badge variant={socketConnected ? 'neutral' : 'warn'} dot>
                    {socketConnected ? 'stream' : 'polling'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="border-line mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              asChild
              variant="primary"
              size="sm"
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              <Link to="/terminal">Abrir terminal</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/settings">Ajustar risco</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              <Link to="/analytics">Ver analytics</Link>
            </Button>
            {position ? (
              <Button
                variant="danger"
                size="sm"
                className="ml-auto"
                onClick={() => setCloseOpen(true)}
                loading={closePosition.isPending}
              >
                Fechar posição
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <AlertCenter status={status} config={config} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Win rate"
          value={fmtPct(winRate)}
          sub={`${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`}
          icon={<Percent className="h-4 w-4" />}
          tone={winRate >= 50 ? 'profit' : 'warn'}
        />
        <StatCard
          label="Profit factor"
          value={Number.isFinite(profitFactor) ? fmtNumber(profitFactor) : '∞'}
          sub="lucro bruto / perda bruta"
          icon={<Gauge className="h-4 w-4" />}
          tone={profitFactor >= 1.2 ? 'profit' : profitFactor > 0 ? 'warn' : 'loss'}
        />
        <StatCard
          label="Trades"
          value={fmtNumber(summary?.trades ?? 0, 0)}
          sub={`${fmtNumber(summary?.fees ?? 0)} USDT em taxas`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Expectancy"
          value={fmtSignedMoney(summary?.expectancy ?? 0)}
          sub="por trade fechado"
          icon={<Crosshair className="h-4 w-4" />}
          tone={(summary?.expectancy ?? 0) >= 0 ? 'profit' : 'loss'}
        />
        <StatCard
          label="Max drawdown"
          value={fmtPct(summary?.maxDrawdownPct ?? 0)}
          sub="no período de 30 dias"
          icon={<TrendingDown className="h-4 w-4" />}
          tone={(summary?.maxDrawdownPct ?? 0) > 5 ? 'loss' : 'neutral'}
        />
        <StatCard
          label="Tempo médio"
          value={fmtDuration(summary?.avgHoldSec ?? 0)}
          sub={`${summary?.currentStreak ?? 0} streak atual`}
          icon={<Clock3 className="h-4 w-4" />}
          tone="neutral"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader
            title="Curva de equity"
            description="Snapshots do motor, incluindo PnL realizado e não realizado."
            eyebrow="Performance"
            action={
              <SegmentedControl
                size="sm"
                value={range}
                onChange={setRange}
                options={[
                  { value: '24h', label: '24h' },
                  { value: '7d', label: '7d' },
                  { value: '30d', label: '30d' },
                ]}
              />
            }
          />
          <CardBody className="pt-3">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'num text-2xl font-semibold',
                    rangeReturn >= 0 ? 'text-profit' : 'text-loss',
                  )}
                >
                  {fmtSignedPct(rangeReturn)}
                </span>
                <span className="text-dim text-[11px]">no período</span>
              </div>
              <span className="text-dim text-[10px]">
                {equitySeries.length} pontos · atualizado {fmtRelative(metrics.data?.updatedAt)}
              </span>
            </div>
            <EquityChart data={equitySeries} height={290} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Raio-x do dia"
            description="O que o risk guard está vendo agora."
            eyebrow="Proteção"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <CardBody className="space-y-1 pt-4">
            <GuardItem
              label="Stop diário"
              value={
                status.lossProgress >= 100 ? 'atingido' : `${fmtPct(status.lossProgress)} usado`
              }
              tone={
                status.lossProgress >= 100 ? 'loss' : status.lossProgress > 60 ? 'warn' : 'profit'
              }
              detail={`${fmtMoney(Math.max(0, -dayPnl))} de ${fmtMoney(lossLimit)}`}
            />
            <GuardItem
              label="Meta diária"
              value={status.targetProgress >= 100 ? 'atingida' : `${fmtPct(status.targetProgress)}`}
              tone={status.targetProgress >= 100 ? 'profit' : 'info'}
              detail={`${fmtMoney(dayPnl)} de ${fmtMoney(target)}`}
            />
            <GuardItem
              label="Trades hoje"
              value={`${status.tradesDay}/${config?.risk.maxTradesPerDay ?? '—'}`}
              tone={status.tradesDay >= (config?.risk.maxTradesPerDay ?? 0) ? 'warn' : 'neutral'}
              detail={`${fmtNumber(status.winsDay, 0)} wins · ${fmtNumber(status.lossesDay, 0)} losses`}
            />
            <GuardItem
              label="Perdas seguidas"
              value={`${status.consecutiveLosses}/${config?.risk.maxConsecutiveLosses ?? '—'}`}
              tone={
                status.consecutiveLosses >= (config?.risk.maxConsecutiveLosses ?? 0)
                  ? 'loss'
                  : 'neutral'
              }
              detail={`cooldown ${config?.risk.cooldownAfterLossSec ?? 0}s`}
            />
            <GuardItem
              label="Feed de mercado"
              value={feed.connected ? 'ok' : 'offline'}
              tone={feed.connected ? 'profit' : 'loss'}
              detail={`${feedLabel[feed.source]} · ${feed.latencyMs ?? '—'}ms`}
            />
            <GuardItem
              label="Kill switch"
              value={config?.execution.killSwitch ? 'ativo' : 'livre'}
              tone={config?.execution.killSwitch ? 'loss' : 'profit'}
              detail={
                config?.execution.killSwitch
                  ? 'desative em Configurações'
                  : 'pronto para emergência'
              }
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader
            title="Posição aberta"
            description="Execução atual do motor e níveis de saída."
            eyebrow="Trading"
            icon={<Crosshair className="h-4 w-4" />}
            action={
              position ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setCloseOpen(true)}
                  loading={closePosition.isPending}
                >
                  Fechar a mercado
                </Button>
              ) : (
                <Badge variant="neutral">flat</Badge>
              )
            }
          />
          <CardBody className="pt-4">
            {position ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <SideBadge side={position.side} />
                    <div>
                      <p className="num text-ink text-lg font-semibold">{position.symbol}</p>
                      <p className="text-dim text-[11px]">
                        {position.leverage}x · aberta há{' '}
                        {fmtDuration((Date.now() - position.openedAt) / 1_000)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="label">PnL não realizado</p>
                    <PnlText value={position.unrealizedPnl} className="text-xl" />
                    <p
                      className={cn(
                        'num text-[11px]',
                        position.unrealizedPct >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {fmtSignedPct(position.unrealizedPct)} da margem
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <PositionMetric label="Entrada" value={fmtPrice(position.entryPrice)} />
                  <PositionMetric label="Mark" value={fmtPrice(position.markPrice)} />
                  <PositionMetric label="Stop" value={fmtPrice(position.stopPrice)} tone="loss" />
                  <PositionMetric
                    label="Take profit"
                    value={fmtPrice(position.takeProfitPrice)}
                    tone="profit"
                  />
                  <PositionMetric label="Notional" value={fmtMoney(position.notionalUsd)} />
                  <PositionMetric label="Margem" value={fmtMoney(position.marginUsd)} />
                  <PositionMetric label="Quantidade" value={fmtNumber(position.qty, 4)} />
                  <PositionMetric
                    label="Trailing"
                    value={
                      position.trailingStopPrice
                        ? fmtPrice(position.trailingStopPrice)
                        : 'aguardando'
                    }
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Crosshair className="h-6 w-6" />}
                title="Nenhuma posição aberta"
                description={
                  running
                    ? 'O motor está observando o feed e aguardando um setup compatível com o risk guard.'
                    : 'Inicie o bot para que o scalp momentum + order flow comece a procurar entradas.'
                }
                action={
                  !running ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/terminal">Ver mercado</Link>
                    </Button>
                  ) : null
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Estratégia ativa"
            description="Parâmetros que definem cada entrada."
            eyebrow="Config"
            icon={<Layers3 className="h-4 w-4" />}
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/settings">editar</Link>
              </Button>
            }
          />
          <CardBody className="space-y-3 pt-4">
            <ConfigRow
              label="Entrada"
              value={config?.strategy.entryStyle === 'maker' ? 'Maker-first' : 'Taker'}
            />
            <ConfigRow
              label="Maker fills"
              value={`${status.entryMetrics.makerFills}/${status.entryMetrics.makerAttempts} · ${status.entryMetrics.makerFillRatePct}%`}
            />
            <ConfigRow
              label="Tempo médio maker"
              value={
                status.entryMetrics.avgMakerFillMs === null
                  ? '—'
                  : `${status.entryMetrics.avgMakerFillMs}ms`
              }
            />
            <ConfigRow
              label="Requotes / parciais"
              value={`${status.entryMetrics.requotes} / ${status.entryMetrics.partialFills}`}
            />
            <ConfigRow
              label="Fallback taker"
              value={`${status.entryMetrics.takerFallbacks} · ${fmtMoney(status.entryMetrics.fallbackCostUsd)}`}
            />
            <ConfigRow
              label="Alavancagem"
              value={`${config?.leverage ?? '—'}x ${config?.marginMode ?? ''}`}
            />
            <ConfigRow
              label="Take / stop"
              value={`${config?.strategy.takeProfitBps ?? '—'} / ${config?.strategy.stopLossBps ?? '—'} bps`}
            />
            <ConfigRow label="Time stop" value={`${config?.strategy.timeStopSec ?? '—'}s`} />
            <ConfigRow label="Risco / trade" value={`${config?.risk.riskPerTradePct ?? '—'}%`} />
            <ConfigRow label="Notional máximo" value={fmtMoney(config?.risk.maxNotionalUsd ?? 0)} />
            <ConfigRow label="Meta / stop" value={`${fmtMoney(target)} / ${fmtMoney(lossLimit)}`} />
            <div className="border-line bg-panel-2/60 text-dim rounded-xl border p-3 text-[10px] leading-relaxed">
              O bot usa EMA rápida/lenta, desequilíbrio do book e delta de agressão. Entradas maker
              têm timeout, requote limitado, fills parciais e fallback taker opcional.
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader
            title="Trades recentes"
            description="Últimas execuções registradas no ledger."
            eyebrow="Ledger"
            action={
              <Button
                asChild
                size="sm"
                variant="ghost"
                rightIcon={<ArrowUpRight className="h-3.5 w-3.5" />}
              >
                <Link to="/trades">ver todos</Link>
              </Button>
            }
          />
          <CardBody className="px-0 pb-0 pt-3">
            {trades.isLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : trades.data?.items.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Hora</TH>
                    <TH>Par</TH>
                    <TH>Lado</TH>
                    <TH>Entrada → saída</TH>
                    <TH className="text-right">PnL</TH>
                    <TH className="text-right">R</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {trades.data.items.map((trade) => (
                    <TR key={trade.id}>
                      <TD className="num text-dim whitespace-nowrap">
                        {fmtDateTime(trade.closedAt ?? trade.createdAt)}
                      </TD>
                      <TD className="num text-ink">{trade.symbol}</TD>
                      <TD>
                        <SideBadge side={trade.side} />
                      </TD>
                      <TD className="num whitespace-nowrap">
                        {trade.entryPrice ? fmtPrice(trade.entryPrice) : '—'}
                        <span className="text-dim mx-1">→</span>
                        {trade.exitPrice ? fmtPrice(trade.exitPrice) : '—'}
                      </TD>
                      <TD className="text-right">
                        {trade.status === 'closed' ? (
                          <PnlText value={trade.netPnl} />
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </TD>
                      <TD className="num text-right">
                        {trade.status === 'closed' ? `${trade.rMultiple.toFixed(2)}R` : '—'}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <TradeStatusBadge status={trade.status} />
                          {trade.isDemo ? <DemoBadge /> : null}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <CardBody>
                <EmptyState
                  title="Sem trades ainda"
                  description="Inicie o modo paper para gerar histórico."
                />
              </CardBody>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Saúde do sistema"
              description="Feed, API e processo."
              eyebrow="Infra"
              icon={<Activity className="h-4 w-4" />}
            />
            <CardBody className="space-y-3 pt-4">
              <HealthRow
                label="WebSocket dashboard"
                ok={socketConnected}
                value={socketConnected ? 'online' : 'polling'}
              />
              <HealthRow
                label="Feed de mercado"
                ok={feed.connected}
                value={`${feedLabel[feed.source]} · ${feed.latencyMs ?? '—'}ms`}
              />
              <HealthRow
                label="Último tick"
                ok={Boolean(feed.lastTickAt)}
                value={fmtRelative(feed.lastTickAt)}
              />
              <HealthRow label="Uptime" ok value={fmtDuration(status.uptimeSec)} />
              <HealthRow
                label="API MEXC"
                ok={status.api.connected}
                value={status.api.message ?? '—'}
              />
              <div className="hairline pt-3">
                <p className="label">PnL semanal</p>
                <p className="num text-ink mt-1 text-sm font-semibold">
                  {fmtSignedMoney(summary?.weekPnl ?? 0)}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="PnL diário"
              description="Últimos 14 dias fechados."
              eyebrow="Histórico"
              icon={<Wallet className="h-4 w-4" />}
            />
            <CardBody className="pt-3">
              <PnlBars data={(metrics.data?.daily ?? []).slice(-14)} height={190} />
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Fechar posição a mercado?"
        description="A ordem de saída usa taxa taker e pode sofrer slippage. O bot continua em execução e pode abrir uma nova posição depois."
        confirmLabel="Fechar agora"
        loading={closePosition.isPending}
        onConfirm={() => closePosition.mutate(undefined, { onSettled: () => setCloseOpen(false) })}
      />
    </div>
  );
}

function GuardProgress({
  icon,
  label,
  value,
  hint,
  progress,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  progress: number;
  tone: 'profit' | 'loss';
}) {
  return (
    <div className="border-line bg-panel-2/70 rounded-xl border p-3.5">
      <div className="text-muted flex items-center gap-2">
        <span className={tone === 'profit' ? 'text-profit' : 'text-loss'}>{icon}</span>
        <span className="label">{label}</span>
      </div>
      <p
        className={cn(
          'num mt-2 text-lg font-semibold',
          tone === 'profit' ? 'text-profit' : 'text-loss',
        )}
      >
        {value}
      </p>
      <Progress value={progress} tone={tone} className="mt-2" />
      <p className="text-dim mt-1.5 text-[10px]">{hint}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-dim text-[9px] uppercase tracking-wider">{label}</p>
      <p className="num text-ink mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function GuardItem({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'profit' | 'loss' | 'warn' | 'info' | 'neutral';
}) {
  const color =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'info'
            ? 'text-info'
            : 'text-muted';
  return (
    <div className="border-line/60 flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <div>
        <p className="text-ink text-xs">{label}</p>
        <p className="text-dim text-[10px]">{detail}</p>
      </div>
      <span className={cn('num text-xs font-semibold', color)}>{value}</span>
    </div>
  );
}

function PositionMetric({
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
          'num mt-0.5 text-xs font-semibold',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-dim">{label}</span>
      <span className="num text-ink font-medium">{value}</span>
    </div>
  );
}

function HealthRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted flex items-center gap-2 text-xs">
        <StatusDot tone={ok ? 'profit' : 'warn'} pulse={ok} />
        {label}
      </span>
      <span className="text-ink max-w-[55%] truncate text-right text-[11px]">{value}</span>
    </div>
  );
}
