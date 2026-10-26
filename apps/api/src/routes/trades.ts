import { symbolSchema, type TradeStatus } from '@goodz/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Repository } from '../db/repo';
import { HttpError } from '../lib/http-error';
import { csvEscape, parseInput } from './helpers';

interface TradeRoutesDeps {
  repo: Repository;
}

const tradeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'open', 'closed', 'canceled', 'rejected']).optional(),
  symbol: symbolSchema.optional(),
  mode: z.enum(['paper', 'live']).optional(),
});

export function registerTradeRoutes(app: FastifyInstance, deps: TradeRoutesDeps): void {
  app.get('/api/trades', async (request) => {
    const query = parseInput(tradeQuerySchema, request.query);
    return deps.repo.listTrades({
      limit: query.limit,
      offset: query.offset,
      status: query.status as TradeStatus | undefined,
      symbol: query.symbol,
      mode: query.mode,
    });
  });

  app.get('/api/trades/:id', async (request) => {
    const { id } = parseInput(z.object({ id: z.string().min(1).max(128) }), request.params);
    const trade = deps.repo.getTrade(id);
    if (!trade) throw new HttpError(404, 'trade_not_found', 'Trade não encontrado.');
    return { trade, orders: deps.repo.getOrdersByTrade(id) };
  });

  app.get('/api/trades/export.csv', async (request, reply) => {
    const query = parseInput(
      z.object({ mode: z.enum(['paper', 'live']).optional() }),
      request.query,
    );
    const trades = deps.repo.getClosedTrades(10_000, query.mode);
    const header = [
      'id',
      'mode',
      'symbol',
      'side',
      'status',
      'qty',
      'entry_price',
      'exit_price',
      'notional_usd',
      'leverage',
      'fees',
      'gross_pnl',
      'net_pnl',
      'r_multiple',
      'close_reason',
      'opened_at',
      'closed_at',
    ].join(',');
    const rows = trades.map((trade) =>
      [
        trade.id,
        trade.mode,
        trade.symbol,
        trade.side,
        trade.status,
        trade.qty,
        trade.entryPrice,
        trade.exitPrice,
        trade.notionalUsd,
        trade.leverage,
        trade.fees,
        trade.grossPnl,
        trade.netPnl,
        trade.rMultiple,
        trade.closeReason,
        trade.openedAt ? new Date(trade.openedAt).toISOString() : '',
        trade.closedAt ? new Date(trade.closedAt).toISOString() : '',
      ]
        .map(csvEscape)
        .join(','),
    );

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="goodz-trades-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
    return [header, ...rows].join('\n');
  });

  app.get('/api/orders', async () => ({ items: deps.repo.getOpenOrders() }));
}
