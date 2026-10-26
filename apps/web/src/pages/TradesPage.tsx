import type { BotMode, TradeStatus } from '@goodz/core';
import { Download, FileSearch, Filter, ListFilter, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { DemoBadge, PnlText, SideBadge, TradeStatusBadge } from '@/components/trades/badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { SegmentedControl } from '@/components/ui/segmented';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useMetrics, useTrade, useTrades } from '@/hooks/useTrader';
import { api } from '@/lib/api';
import {
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtTime,
} from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

export function TradesPage() {
  const [status, setStatus] = useState<TradeStatus | 'all'>('all');
  const [mode, setMode] = useState<BotMode | 'all'>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');

  const metrics = useMetrics(30);
  const trades = useTrades({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: status === 'all' ? undefined : status,
    mode: mode === 'all' ? undefined : mode,
    symbol: symbol.trim() || undefined,
  });
  const detail = useTrade(selected);
  const summary = metrics.data?.summary;
  const totalPages = Math.max(1, Math.ceil((trades.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5" data-testid="trades-page">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="PnL 30 dias"
          value={<PnlText value={summary?.totalPnl ?? 0} className="text-xl" />}
          sub={`${fmtNumber(summary?.trades ?? 0, 0)} trades fechados`}
        />
        <StatCard
          label="Win rate"
          value={fmtPct(summary?.winRate ?? 0)}
          sub={`${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`}
          tone={(summary?.winRate ?? 0) >= 50 ? 'profit' : 'warn'}
        />
        <StatCard
          label="Profit factor"
          value={
            Number.isFinite(summary?.profitFactor ?? 0)
              ? fmtNumber(summary?.profitFactor ?? 0)
              : '∞'
          }
          sub="bruto / perda bruta"
          tone={(summary?.profitFactor ?? 0) >= 1.2 ? 'profit' : 'warn'}
        />
        <StatCard
          label="Taxas pagas"
          value={fmtMoney(summary?.fees ?? 0)}
          sub={`${fmtNumber(summary?.avgHoldSec ?? 0, 0)}s de hold médio`}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader
          title="Ledger de trades"
          description="Todas as entradas, saídas, taxas e motivos de fechamento."
          eyebrow="Execução"
          icon={<ListFilter className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant="secondary"
                size="sm"
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                <a href={api.exportTradesUrl(mode === 'all' ? undefined : mode)}>Exportar CSV</a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void trades.refetch()}
                loading={trades.isFetching}
              >
                Atualizar
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setPage(0);
              }}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'paper', label: 'Paper' },
                { value: 'live', label: 'Live' },
              ]}
            />
            <div className="flex items-center gap-2">
              <Filter className="text-dim h-3.5 w-3.5" />
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as TradeStatus | 'all');
                  setPage(0);
                }}
                className="h-9 w-36 text-xs"
                aria-label="Filtrar status"
              >
                <option value="all">Todos os status</option>
                <option value="closed">Fechadas</option>
                <option value="open">Abertas</option>
                <option value="pending">Pendentes</option>
                <option value="canceled">Canceladas</option>
                <option value="rejected">Rejeitadas</option>
              </Select>
            </div>
            <input
              value={symbol}
              onChange={(event) => {
                setSymbol(event.target.value.toUpperCase());
                setPage(0);
              }}
              placeholder="BTC_USDT"
              className="border-line-strong bg-panel-2 text-ink placeholder:text-dim focus:border-acid/60 h-9 w-36 rounded-xl border px-3 text-xs focus:outline-none"
              aria-label="Filtrar símbolo"
            />
            <span className="text-dim ml-auto text-[10px]">
              {fmtNumber(trades.data?.total ?? 0, 0)} registros
            </span>
          </div>

          {trades.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : trades.data?.items.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Par</TH>
                  <TH>Lado</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Entrada</TH>
                  <TH className="text-right">Saída</TH>
                  <TH className="hidden text-right 2xl:table-cell">Qtd</TH>
                  <TH className="hidden text-right xl:table-cell">Notional</TH>
                  <TH className="hidden text-right xl:table-cell">Alav.</TH>
                  <TH className="hidden text-right 2xl:table-cell">Taxas</TH>
                  <TH className="text-right">PnL</TH>
                  <TH className="text-right">R</TH>
                  <TH className="hidden lg:table-cell">Motivo</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {trades.data.items.map((trade) => (
                  <TR
                    key={trade.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(trade.id)}
                  >
                    <TD className="num text-dim whitespace-nowrap">
                      {fmtDateTime(trade.closedAt ?? trade.createdAt)}
                    </TD>
                    <TD className="num text-ink whitespace-nowrap">{trade.symbol}</TD>
                    <TD>
                      <SideBadge side={trade.side} />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <TradeStatusBadge status={trade.status} />
                        {trade.isDemo ? <DemoBadge /> : null}
                      </div>
                    </TD>
                    <TD className="num text-right">
                      {trade.entryPrice ? fmtPrice(trade.entryPrice) : '—'}
                    </TD>
                    <TD className="num text-right">
                      {trade.exitPrice ? fmtPrice(trade.exitPrice) : '—'}
                    </TD>
                    <TD className="num hidden text-right 2xl:table-cell">
                      {fmtNumber(trade.qty, 4)}
                    </TD>
                    <TD className="num hidden text-right xl:table-cell">
                      {fmtMoney(trade.notionalUsd)}
                    </TD>
                    <TD className="num hidden text-right xl:table-cell">{trade.leverage}x</TD>
                    <TD className="num hidden text-right 2xl:table-cell">
                      {fmtNumber(trade.fees, 4)}
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
                    <TD className="text-dim whitespace-nowrap">{trade.closeReason || '—'}</TD>
                    <TD>
                      <Button size="icon" variant="ghost" aria-label="Ver detalhes">
                        <FileSearch className="h-3.5 w-3.5" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              icon={<ListFilter className="h-6 w-6" />}
              title="Nenhum trade encontrado"
              description="Ajuste os filtros ou inicie o bot em paper mode para gerar histórico."
            />
          )}

          <div className="border-line flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <span className="text-dim text-[10px]">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do trade</DialogTitle>
            <DialogDescription>
              {detail.data?.trade.id ?? selected} · ledger completo e ordens vinculadas.
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : detail.data ? (
            <div className="space-y-4">
              <div className="border-line bg-panel-2/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <SideBadge side={detail.data.trade.side} />
                  <span className="num text-ink text-sm font-semibold">
                    {detail.data.trade.symbol}
                  </span>
                  <TradeStatusBadge status={detail.data.trade.status} />
                  {detail.data.trade.isDemo ? <DemoBadge /> : null}
                </div>
                <PnlText value={detail.data.trade.netPnl} className="text-lg" />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Detail label="Entrada" value={fmtPrice(detail.data.trade.entryPrice)} />
                <Detail label="Saída" value={fmtPrice(detail.data.trade.exitPrice)} />
                <Detail label="Qtd" value={fmtNumber(detail.data.trade.qty, 4)} />
                <Detail label="Notional" value={fmtMoney(detail.data.trade.notionalUsd)} />
                <Detail label="Alavancagem" value={`${detail.data.trade.leverage}x`} />
                <Detail label="Margem" value={fmtMoney(detail.data.trade.marginUsd)} />
                <Detail label="Taxas" value={fmtMoney(detail.data.trade.fees)} />
                <Detail label="R múltiplo" value={`${detail.data.trade.rMultiple.toFixed(2)}R`} />
                <Detail
                  label="Aberta"
                  value={detail.data.trade.openedAt ? fmtDateTime(detail.data.trade.openedAt) : '—'}
                />
                <Detail
                  label="Fechada"
                  value={detail.data.trade.closedAt ? fmtDateTime(detail.data.trade.closedAt) : '—'}
                />
                <Detail
                  label="Duração"
                  value={
                    detail.data.trade.openedAt && detail.data.trade.closedAt
                      ? fmtDuration(
                          (detail.data.trade.closedAt - detail.data.trade.openedAt) / 1_000,
                        )
                      : '—'
                  }
                />
                <Detail label="Motivo" value={detail.data.trade.closeReason || '—'} />
              </div>

              <div>
                <p className="label mb-2">Ordens</p>
                {detail.data.orders.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Hora</TH>
                        <TH>Lado</TH>
                        <TH>Tipo</TH>
                        <TH className="text-right">Preço</TH>
                        <TH className="text-right">Qtd</TH>
                        <TH className="text-right">Taxa</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detail.data.orders.map((order) => (
                        <TR key={order.id}>
                          <TD className="num text-dim">{fmtTime(order.createdAt)}</TD>
                          <TD>
                            <SideBadge side={order.side} />
                          </TD>
                          <TD className="uppercase">{order.type}</TD>
                          <TD className="num text-right">
                            {order.price ? fmtPrice(order.price) : 'market'}
                          </TD>
                          <TD className="num text-right">{fmtNumber(order.qty, 4)}</TD>
                          <TD className="num text-right">{fmtNumber(order.fee, 4)}</TD>
                          <TD>
                            <Badge
                              variant={
                                order.status === 'filled'
                                  ? 'profit'
                                  : order.status === 'rejected'
                                    ? 'loss'
                                    : 'neutral'
                              }
                            >
                              {order.status}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="text-dim text-[11px]">Nenhuma ordem registrada.</p>
                )}
              </div>

              <div className="border-line bg-panel-2/50 rounded-xl border p-3">
                <p className="label mb-1">Abertura</p>
                <p className="text-muted text-[11px]">{detail.data.trade.openReason || '—'}</p>
              </div>
            </div>
          ) : (
            <p className="text-loss text-xs">Trade não encontrado.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line bg-panel-2/50 rounded-lg border p-2.5">
      <p className="text-dim text-[9px] uppercase tracking-wider">{label}</p>
      <p className={cn('num text-ink mt-0.5 text-[11px] font-medium')}>{value}</p>
    </div>
  );
}
