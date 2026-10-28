import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  Percent,
  ScrollText,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { EquityChart } from '@/components/charts/EquityChart';
import { HourlyChart } from '@/components/charts/HourlyChart';
import { PnlBars } from '@/components/charts/PnlBars';
import { RDistributionChart } from '@/components/charts/RDistributionChart';
import { PnlText } from '@/components/trades/badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useAnalytics, useMetrics } from '@/hooks/useTrader';
import { dayShort, fmtDuration, fmtMoney, fmtNumber, fmtPct, fmtSignedMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export function AnalyticsPage() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const analytics = useAnalytics(range);
  const paperMetrics = useMetrics(range, 'paper');
  const liveMetrics = useMetrics(range, 'live');
  const data = analytics.data;
  const summary = data?.summary;

  return (
    <div className="space-y-5" data-testid="analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Performance</p>
          <h2 className="text-ink mt-1 text-lg font-semibold tracking-tight">
            Leitura fria do edge
          </h2>
          <p className="text-muted mt-1 text-xs">
            Métricas calculadas apenas sobre trades fechados, com taxas incluídas.
          </p>
        </div>
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as 7 | 30 | 90)}
          options={[
            { value: 7, label: '7 dias' },
            { value: 30, label: '30 dias' },
            { value: 90, label: '90 dias' },
          ]}
        />
      </div>

      {analytics.isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={`PnL líquido ${range}d`}
              value={<PnlText value={summary?.totalPnl ?? 0} className="text-xl" />}
              sub={`${fmtNumber(summary?.trades ?? 0, 0)} trades · ${fmtMoney(summary?.fees ?? 0)} taxas`}
              icon={<Wallet className="h-4 w-4" />}
              tone={(summary?.totalPnl ?? 0) >= 0 ? 'profit' : 'loss'}
            />
            <StatCard
              label="Win rate"
              value={fmtPct(summary?.winRate ?? 0)}
              sub={`${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`}
              icon={<Percent className="h-4 w-4" />}
              tone={(summary?.winRate ?? 0) >= 50 ? 'profit' : 'warn'}
            />
            <StatCard
              label="Profit factor"
              value={
                Number.isFinite(summary?.profitFactor ?? 0)
                  ? fmtNumber(summary?.profitFactor ?? 0)
                  : '∞'
              }
              sub={`avg win ${fmtMoney(summary?.avgWin ?? 0)} / loss ${fmtMoney(summary?.avgLoss ?? 0)}`}
              icon={<Gauge className="h-4 w-4" />}
              tone={(summary?.profitFactor ?? 0) >= 1.2 ? 'profit' : 'warn'}
            />
            <StatCard
              label="Expectancy"
              value={fmtSignedMoney(summary?.expectancy ?? 0)}
              sub="resultado médio por trade"
              icon={<Target className="h-4 w-4" />}
              tone={(summary?.expectancy ?? 0) >= 0 ? 'profit' : 'loss'}
            />
            <StatCard
              label="Drawdown máximo"
              value={fmtPct(summary?.maxDrawdownPct ?? 0)}
              sub="sobre a curva de equity"
              icon={<TrendingDown className="h-4 w-4" />}
              tone={(summary?.maxDrawdownPct ?? 0) > 8 ? 'loss' : 'neutral'}
            />
            <StatCard
              label="Melhor trade"
              value={fmtSignedMoney(summary?.bestTrade ?? 0)}
              sub={`pior ${fmtSignedMoney(summary?.worstTrade ?? 0)}`}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="profit"
            />
            <StatCard
              label="Streak"
              value={`${summary?.currentStreak ?? 0}`}
              sub={`melhor ${summary?.longestWinStreak ?? 0}W · pior ${summary?.longestLossStreak ?? 0}L`}
              icon={<Activity className="h-4 w-4" />}
              tone={(summary?.currentStreak ?? 0) >= 0 ? 'profit' : 'loss'}
            />
            <StatCard
              label="Hold médio"
              value={fmtDuration(summary?.avgHoldSec ?? 0)}
              sub={`${fmtNumber(summary?.trades ?? 0, 0)} amostras`}
              icon={<Clock3 className="h-4 w-4" />}
            />
          </div>

          <Card data-testid="paper-live-comparison">
            <CardHeader
              title="Paper vs live"
              description="Mesma janela, líquido de taxas. Compare o simulador com o que o mercado entregou."
              eyebrow="Validação"
              icon={<Gauge className="h-4 w-4" />}
              action={
                <Badge variant={liveMetrics.data?.summary.trades ? 'profit' : 'neutral'}>
                  {liveMetrics.data?.summary.trades
                    ? `${liveMetrics.data.summary.trades} live`
                    : 'sem trades live'}
                </Badge>
              }
            />
            <CardBody className="pt-3">
              <Table>
                <THead>
                  <TR>
                    <TH>Métrica</TH>
                    <TH className="text-right">Paper</TH>
                    <TH className="text-right">Live</TH>
                  </TR>
                </THead>
                <TBody>
                  <TR>
                    <TD>PnL líquido</TD>
                    <TD className="num text-right">
                      {fmtSignedMoney(paperMetrics.data?.summary.totalPnl ?? 0)}
                    </TD>
                    <TD className="num text-right">
                      {fmtSignedMoney(liveMetrics.data?.summary.totalPnl ?? 0)}
                    </TD>
                  </TR>
                  <TR>
                    <TD>Trades</TD>
                    <TD className="num text-right">
                      {fmtNumber(paperMetrics.data?.summary.trades ?? 0, 0)}
                    </TD>
                    <TD className="num text-right">
                      {fmtNumber(liveMetrics.data?.summary.trades ?? 0, 0)}
                    </TD>
                  </TR>
                  <TR>
                    <TD>Win rate</TD>
                    <TD className="num text-right">
                      {fmtPct(paperMetrics.data?.summary.winRate ?? 0)}
                    </TD>
                    <TD className="num text-right">
                      {fmtPct(liveMetrics.data?.summary.winRate ?? 0)}
                    </TD>
                  </TR>
                  <TR>
                    <TD>Profit factor</TD>
                    <TD className="num text-right">
                      {fmtNumber(paperMetrics.data?.summary.profitFactor ?? 0)}
                    </TD>
                    <TD className="num text-right">
                      {fmtNumber(liveMetrics.data?.summary.profitFactor ?? 0)}
                    </TD>
                  </TR>
                  <TR>
                    <TD>Taxas</TD>
                    <TD className="num text-right">
                      {fmtMoney(paperMetrics.data?.summary.fees ?? 0)}
                    </TD>
                    <TD className="num text-right">
                      {fmtMoney(liveMetrics.data?.summary.fees ?? 0)}
                    </TD>
                  </TR>
                </TBody>
              </Table>
              {!liveMetrics.data?.summary.trades ? (
                <p className="text-dim mt-2 text-[10px]">
                  Ainda não há trades live nesta janela; a coluna live não é evidência de edge.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-2">
              <CardHeader
                title="Equity do período"
                description="Realizado + não realizado nos snapshots do motor."
                eyebrow="Curva"
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <CardBody className="pt-3">
                <EquityChart data={data.equity} height={300} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Distribuição R"
                description="Quantidade de trades por faixa de R."
                eyebrow="Qualidade"
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <CardBody className="pt-3">
                <RDistributionChart data={data.rDistribution} height={300} />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="PnL por dia"
                description="Dias sem trades aparecem zerados."
                eyebrow="Calendário"
                icon={<Wallet className="h-4 w-4" />}
              />
              <CardBody className="pt-3">
                <PnlBars data={data.daily} height={260} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Edge por hora UTC"
                description="Barras de PnL e linha de win rate."
                eyebrow="Sazonalidade"
                icon={<Clock3 className="h-4 w-4" />}
              />
              <CardBody className="pt-3">
                <HourlyChart data={data.hourly} height={260} />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-2">
              <CardHeader
                title="Dias"
                description="Detalhe diário do período selecionado."
                eyebrow="Ledger"
                icon={<ScrollText className="h-4 w-4" />}
              />
              <CardBody className="px-0 pb-0 pt-3">
                <Table>
                  <THead>
                    <TR>
                      <TH>Dia</TH>
                      <TH className="text-right">Trades</TH>
                      <TH className="text-right">Wins</TH>
                      <TH className="text-right">Losses</TH>
                      <TH className="text-right">Taxas</TH>
                      <TH className="text-right">PnL</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...data.daily].reverse().map((day) => (
                      <TR key={day.dayKey}>
                        <TD className="num text-ink">{dayShort(day.dayKey)}</TD>
                        <TD className="num text-right">{day.trades}</TD>
                        <TD className="num text-profit text-right">{day.wins}</TD>
                        <TD className="num text-loss text-right">{day.losses}</TD>
                        <TD className="num text-right">{fmtNumber(day.fees, 4)}</TD>
                        <TD className="text-right">
                          <PnlText value={day.pnl} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Motivos de saída"
                description="Onde o edge realmente morre."
                eyebrow="Diagnóstico"
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <CardBody className="space-y-3 pt-4">
                {data.exitReasons.length ? (
                  data.exitReasons.map((reason) => {
                    const max = Math.max(...data.exitReasons.map((item) => item.count), 1);
                    return (
                      <div key={reason.reason}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-ink">{reason.reason}</span>
                          <span className="num text-dim">{reason.count}x</span>
                        </div>
                        <div className="bg-white/6 h-1.5 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              reason.pnl >= 0 ? 'bg-profit' : 'bg-loss',
                            )}
                            style={{ width: `${(reason.count / max) * 100}%` }}
                          />
                        </div>
                        <p
                          className={cn(
                            'num mt-1 text-[10px]',
                            reason.pnl >= 0 ? 'text-profit' : 'text-loss',
                          )}
                        >
                          {fmtMoney(reason.pnl)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-dim text-[11px]">Sem saídas registradas no período.</p>
                )}
                <div className="border-line bg-panel-2/60 mt-4 rounded-xl border p-3">
                  <Badge variant="accent">regra</Badge>
                  <p className="text-dim mt-2 text-[10px] leading-relaxed">
                    Se o profit factor ficar abaixo de 1.0 por vários dias, reduza o risco por trade
                    e valide o spread/fee antes de aumentar o notional.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
