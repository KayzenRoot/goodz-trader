import type {
  CloseResult,
  MarketView,
  OrderRequest,
  OrderResult,
  PositionView,
  Side,
} from '@goodz/core';

export interface BrokerReconciliation {
  openPositions: number;
  openOrders: number;
  message: string;
}

export interface ClosePositionInput {
  symbol: string;
  side: Side;
  qty: number;
  positionId?: number;
}

export interface Broker {
  readonly mode: 'paper' | 'live';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getEquity(): Promise<number>;
  getAvailableBalance(): Promise<number>;
  placeOrder(request: OrderRequest): Promise<OrderResult>;
  pollOrder(order: {
    exchangeOrderId: string | null;
    clientOrderId: string;
  }): Promise<OrderResult | null>;
  cancelOrder(order: { exchangeOrderId: string | null; clientOrderId: string }): Promise<void>;
  closePosition(input: ClosePositionInput): Promise<CloseResult>;
  onSnapshot(view: MarketView): Promise<OrderResult[]>;
  reconcile(): Promise<BrokerReconciliation>;
  getExchangePositionId?(symbol: string, side: Side): Promise<number | null>;
  markPrice(position: PositionView): number;
}
