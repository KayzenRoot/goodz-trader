import {
  grossPnl,
  notionalUsd,
  type CloseResult,
  type ContractSpec,
  type MarketView,
  type OrderRequest,
  type OrderResult,
  type PositionView,
  type Side,
} from '@goodz/core';

import type { Repository } from '../db/repo';
import type { AppLogger } from '../lib/logger';
import type { Broker, BrokerReconciliation, ClosePositionInput } from './types';

interface PaperOrder {
  clientOrderId: string;
  exchangeOrderId: string;
  symbol: string;
  side: Side;
  action: 'open' | 'close';
  type: 'market' | 'limit';
  price: number;
  qty: number;
  filledQty: number;
  avgPrice: number | null;
  fee: number;
  status: 'open' | 'filled' | 'canceled' | 'rejected';
  createdAt: number;
  error?: string;
}

export interface PaperBrokerOptions {
  repo: Repository;
  contract: ContractSpec;
  startingBalance: number;
  feeMaker: number;
  feeTaker: number;
  slippageBps: number;
  logger: AppLogger;
}

/**
 * Deterministic paper broker. Market orders fill against the current best
 * bid/ask with slippage; post-only orders wait for the market to cross.
 */
export class PaperBroker implements Broker {
  readonly mode = 'paper' as const;
  private market: MarketView | null = null;
  private readonly orders = new Map<string, PaperOrder>();

  constructor(private readonly options: PaperBrokerOptions) {}

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    for (const order of this.orders.values()) {
      if (order.status === 'open') order.status = 'canceled';
    }
  }

  async getEquity(): Promise<number> {
    return this.options.startingBalance + this.options.repo.getRealizedPnl('paper');
  }

  async getAvailableBalance(): Promise<number> {
    return this.getEquity();
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const snapshot = this.market?.snapshot;
    if (!snapshot) {
      return rejected(request, 'Feed de mercado indisponível');
    }

    const price = this.referencePrice(request, snapshot);
    const order: PaperOrder = {
      clientOrderId: request.clientOrderId,
      exchangeOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      action: request.action,
      type: request.type,
      price: request.price ?? price,
      qty: request.qty,
      filledQty: 0,
      avgPrice: null,
      fee: 0,
      status: 'open',
      createdAt: Date.now(),
    };

    if (request.type === 'market') {
      const fillPrice = this.applySlippage(request, price);
      const notional = notionalUsd(fillPrice, request.qty, this.options.contract.contractSize);
      order.status = 'filled';
      order.filledQty = request.qty;
      order.avgPrice = fillPrice;
      order.fee = round(notional * this.options.feeTaker);
      this.orders.set(order.clientOrderId, order);
      return toResult(order);
    }

    if (request.postOnly && request.price) {
      const crosses =
        (request.action === 'open' && request.side === 'long' && request.price >= snapshot.ask) ||
        (request.action === 'open' && request.side === 'short' && request.price <= snapshot.bid) ||
        (request.action === 'close' && request.side === 'long' && request.price <= snapshot.bid) ||
        (request.action === 'close' && request.side === 'short' && request.price >= snapshot.ask);
      if (crosses) {
        order.status = 'rejected';
        order.error = 'Post-only cruzaria o spread';
        this.orders.set(order.clientOrderId, order);
        return toResult(order);
      }
    }

    this.orders.set(order.clientOrderId, order);
    return toResult(order);
  }

  async pollOrder(input: {
    exchangeOrderId: string | null;
    clientOrderId: string;
  }): Promise<OrderResult | null> {
    const order = this.orders.get(input.clientOrderId);
    return order ? toResult(order) : null;
  }

  async cancelOrder(input: {
    exchangeOrderId: string | null;
    clientOrderId: string;
  }): Promise<void> {
    const order = this.orders.get(input.clientOrderId);
    if (order && order.status === 'open') order.status = 'canceled';
  }

  async closePosition(input: ClosePositionInput): Promise<CloseResult> {
    const snapshot = this.market?.snapshot;
    if (!snapshot) throw new Error('Feed de mercado indisponível para fechar a posição');
    const exitPrice = this.applySlippage(
      {
        symbol: input.symbol,
        side: input.side,
        action: 'close',
        type: 'market',
        qty: input.qty,
        leverage: 1,
        marginMode: 'isolated',
        clientOrderId: 'paper-close',
      },
      input.side === 'long' ? snapshot.bid : snapshot.ask,
    );
    const notional = notionalUsd(exitPrice, input.qty, this.options.contract.contractSize);
    return {
      exitPrice,
      filledQty: input.qty,
      fee: round(notional * this.options.feeTaker),
      exchangeOrderId: null,
    };
  }

  async onSnapshot(view: MarketView): Promise<OrderResult[]> {
    this.market = view;
    const snapshot = view.snapshot;
    if (!snapshot) return [];
    const fills: OrderResult[] = [];

    for (const order of this.orders.values()) {
      if (order.status !== 'open' || order.type !== 'limit') continue;
      const shouldFill =
        (order.action === 'open' && order.side === 'long' && snapshot.ask <= order.price) ||
        (order.action === 'open' && order.side === 'short' && snapshot.bid >= order.price) ||
        (order.action === 'close' && order.side === 'long' && snapshot.bid >= order.price) ||
        (order.action === 'close' && order.side === 'short' && snapshot.ask <= order.price);
      if (!shouldFill) continue;

      order.status = 'filled';
      order.filledQty = order.qty;
      order.avgPrice = order.price;
      order.fee = round(
        notionalUsd(order.price, order.qty, this.options.contract.contractSize) *
          (order.action === 'open' ? this.options.feeMaker : this.options.feeTaker),
      );
      fills.push(toResult(order));
    }

    return fills;
  }

  async reconcile(): Promise<BrokerReconciliation> {
    return { openPositions: 0, openOrders: 0, message: 'paper broker' };
  }

  async getExchangePositionId(): Promise<number | null> {
    return null;
  }

  markPrice(position: PositionView): number {
    return position.markPrice;
  }

  private referencePrice(
    request: OrderRequest,
    snapshot: NonNullable<MarketView['snapshot']>,
  ): number {
    if (request.type === 'limit' && request.price) return request.price;
    if (request.action === 'open') {
      return request.side === 'long' ? snapshot.ask : snapshot.bid;
    }
    return request.side === 'long' ? snapshot.bid : snapshot.ask;
  }

  private applySlippage(request: OrderRequest, price: number): number {
    const factor = this.options.slippageBps / 10_000;
    if (request.action === 'open') {
      return round(price * (request.side === 'long' ? 1 + factor : 1 - factor));
    }
    return round(price * (request.side === 'long' ? 1 - factor : 1 + factor));
  }

  getOpenOrderCount(): number {
    return [...this.orders.values()].filter((order) => order.status === 'open').length;
  }

  getLastOrder(): PaperOrder | null {
    const orders = [...this.orders.values()];
    return orders.at(-1) ?? null;
  }
}

function toResult(order: PaperOrder): OrderResult {
  return {
    exchangeOrderId: order.exchangeOrderId,
    clientOrderId: order.clientOrderId,
    status: order.status,
    filledQty: order.filledQty,
    avgPrice: order.avgPrice,
    fee: order.fee,
    error: order.error,
  };
}

function rejected(request: OrderRequest, error: string): OrderResult {
  return {
    exchangeOrderId: '',
    clientOrderId: request.clientOrderId,
    status: 'rejected',
    filledQty: 0,
    avgPrice: null,
    fee: 0,
    error,
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

// Kept for symmetry with the live broker and to make paper PnL audits easy.
export function paperPnl(
  side: Side,
  entry: number,
  exit: number,
  qty: number,
  contractSize: number,
): number {
  return grossPnl(side, entry, exit, qty, contractSize);
}
