import {
  type CloseResult,
  type ContractSpec,
  type MarketView,
  type OrderRequest,
  type OrderResult,
  type PositionView,
  type Side,
} from '@goodz/core';
import {
  MexcApiError,
  MexcPrivateWs,
  mapOrderState,
  type MexcFuturesClient,
  type RawAsset,
  type RawOrder,
  type RawPosition,
} from '@goodz/mexc';

import type { AppLogger } from '../lib/logger';
import type { Broker, BrokerReconciliation, ClosePositionInput } from './types';

export interface LiveBrokerOptions {
  client: MexcFuturesClient;
  contract: ContractSpec;
  symbol: string;
  leverage: number;
  marginMode: 'isolated' | 'cross';
  logger: AppLogger;
  pollIntervalMs?: number;
  privateStream?: boolean;
  privateWsUrl?: string;
  onReconnect?: (reconciliation: BrokerReconciliation) => void;
}

export class LiveBroker implements Broker {
  readonly mode = 'live' as const;
  private privateWs: MexcPrivateWs | null = null;
  private readonly cachedOrdersByClient = new Map<string, RawOrder>();
  private readonly cachedOrdersById = new Map<string, RawOrder>();
  private readonly cachedPositions = new Map<number, RawPosition>();
  private cachedAsset: RawAsset | null = null;

  constructor(private readonly options: LiveBrokerOptions) {}

  async connect(): Promise<void> {
    const { client, symbol, logger } = this.options;
    await client.syncTime();

    const [mode, positions, orders, asset] = await Promise.all([
      client.getPositionMode(),
      client.getOpenPositions(symbol),
      client.getOpenOrders(symbol),
      client.getUsdtAsset(),
    ]);

    if (mode !== 2) {
      throw new Error(
        'A conta MEXC está em modo hedge. Mude para one-way no site da MEXC antes de usar o bot.',
      );
    }
    if (positions.length > 0) {
      throw new Error(
        'Existe posição aberta na MEXC. Feche manualmente antes de iniciar para evitar conflito de estado.',
      );
    }
    if (orders.length > 0) {
      logger.warn('Cancelando ordens abertas antes de iniciar', { count: orders.length });
      await client.cancelAll(symbol);
    }
    if (asset.availableBalance <= 0) {
      throw new Error('Saldo disponível em USDT é zero na MEXC.');
    }

    const openType = this.options.marginMode === 'isolated' ? 1 : 2;
    for (const positionType of [1, 2] as const) {
      try {
        await client.changeLeverage({
          symbol,
          leverage: this.options.leverage,
          openType,
          positionType,
        });
      } catch (error) {
        if (error instanceof MexcApiError && error.code === 2021) {
          logger.warn('Alavancagem já configurada na posição existente', {
            positionType,
            leverage: this.options.leverage,
          });
          continue;
        }
        throw error;
      }
    }

    logger.info('Conta MEXC conectada', {
      equity: asset.equity,
      available: asset.availableBalance,
      mode,
    });
    this.startPrivateStream();
  }

  async disconnect(): Promise<void> {
    this.privateWs?.stop();
    this.privateWs = null;
    try {
      await this.options.client.cancelAll(this.options.symbol);
    } catch (error) {
      this.options.logger.warn('Falha ao cancelar ordens ao desconectar', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getEquity(): Promise<number> {
    const asset = await this.options.client.getUsdtAsset();
    return asset.equity;
  }

  async getAvailableBalance(): Promise<number> {
    const asset = await this.options.client.getUsdtAsset();
    return asset.availableBalance;
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { orderId } = await this.options.client.placeOrder(request);
    if (request.type === 'market') {
      return this.waitForFill(orderId, request.clientOrderId, 8_000);
    }
    return {
      exchangeOrderId: orderId,
      clientOrderId: request.clientOrderId,
      status: 'open',
      filledQty: 0,
      avgPrice: null,
      fee: 0,
    };
  }

  async pollOrder(input: {
    exchangeOrderId: string | null;
    clientOrderId: string;
  }): Promise<OrderResult | null> {
    const cached =
      this.cachedOrdersByClient.get(input.clientOrderId) ??
      (input.exchangeOrderId ? this.cachedOrdersById.get(input.exchangeOrderId) : undefined);
    if (cached && ['filled', 'canceled', 'rejected'].includes(mapOrderState(cached.state))) {
      return this.mapOrder(cached, input.clientOrderId);
    }
    if (!input.exchangeOrderId) return null;
    const raw = await this.options.client.getOrder(input.exchangeOrderId);
    this.cacheOrder(raw);
    return this.mapOrder(raw, input.clientOrderId);
  }

  async cancelOrder(input: {
    exchangeOrderId: string | null;
    clientOrderId: string;
  }): Promise<void> {
    if (!input.exchangeOrderId) return;
    await this.options.client.cancelOrders([input.exchangeOrderId]);
  }

  async closePosition(input: ClosePositionInput): Promise<CloseResult> {
    const { client, symbol, leverage, marginMode } = this.options;
    const positions = await client.getOpenPositions(symbol);
    const position = positions.find(
      (item) => item.symbol === symbol && item.positionType === (input.side === 'long' ? 1 : 2),
    );
    if (!position) {
      throw new Error('Posição não encontrada na MEXC para fechar.');
    }

    const qty = Math.min(input.qty, position.holdVol);
    const result = await client.placeOrder({
      symbol,
      side: input.side,
      action: 'close',
      type: 'market',
      qty,
      leverage,
      marginMode,
      clientOrderId: `gz_close_${Date.now().toString(36)}`,
      positionId: position.positionId,
      reduceOnly: true,
    });
    const filled = await this.waitForFill(result.orderId, 'close', 8_000);
    if (filled.status !== 'filled' || !filled.avgPrice) {
      throw new Error(`Ordem de fechamento não preenchida (${filled.status}).`);
    }
    return {
      exitPrice: filled.avgPrice,
      filledQty: filled.filledQty,
      fee: filled.fee,
      exchangeOrderId: filled.exchangeOrderId,
      raw: filled.raw,
    };
  }

  async onSnapshot(_view: MarketView): Promise<OrderResult[]> {
    return [];
  }

  async reconcile(): Promise<BrokerReconciliation> {
    const [positions, orders] = await Promise.all([
      this.options.client.getOpenPositions(this.options.symbol),
      this.options.client.getOpenOrders(this.options.symbol),
    ]);
    return {
      openPositions: positions.length,
      openOrders: orders.length,
      positions: positions.map((position) => ({
        positionId: position.positionId,
        symbol: position.symbol,
        side: position.positionType === 1 ? 'long' : 'short',
        qty: position.holdVol,
      })),
      orders: orders.map((order) => ({
        orderId: String(order.orderId),
        clientOrderId: order.externalOid ?? '',
        status: String(order.state),
      })),
      message: `posições=${positions.length} ordens=${orders.length}`,
    };
  }

  async getExchangePositionId(symbol: string, side: Side): Promise<number | null> {
    const positions = await this.options.client.getOpenPositions(symbol);
    return (
      positions.find((item) => item.positionType === (side === 'long' ? 1 : 2))?.positionId ?? null
    );
  }

  markPrice(position: PositionView): number {
    return position.markPrice;
  }

  private startPrivateStream(): void {
    if (this.options.privateStream === false) return;
    const client = this.options.client;
    if (typeof client.wsLoginPayload !== 'function') return;

    const ws = new MexcPrivateWs({
      url: this.options.privateWsUrl,
      symbol: this.options.symbol,
      login: () => client.wsLoginPayload(),
      onOrder: (order) => this.cacheOrder(order),
      onPosition: (position) => {
        this.cachedPositions.set(position.positionId, position);
      },
      onAsset: (asset) => {
        this.cachedAsset = asset;
      },
      onStatus: (status) => {
        if (status.connected) {
          this.options.logger.info('Private WS MEXC conectado', {
            reconnects: status.reconnects,
          });
          if (status.reconnects > 0) {
            void this.reconcile()
              .then((reconciliation) => this.options.onReconnect?.(reconciliation))
              .catch((error: unknown) => {
                this.options.logger.error('Falha na reconcilia??o ap?s reconex?o', {
                  error: error instanceof Error ? error.message : String(error),
                });
              });
          }
        } else {
          this.options.logger.warn('Private WS MEXC desconectado', {
            reconnects: status.reconnects,
            message: status.message,
          });
        }
      },
    });
    this.privateWs = ws;
    ws.start();
  }

  private cacheOrder(order: RawOrder): void {
    if (order.externalOid) this.cachedOrdersByClient.set(order.externalOid, order);
    this.cachedOrdersById.set(String(order.orderId), order);
    if (this.cachedOrdersByClient.size > 500) this.cachedOrdersByClient.clear();
    if (this.cachedOrdersById.size > 500) this.cachedOrdersById.clear();
  }

  private async waitForFill(
    orderId: string,
    clientOrderId: string,
    timeoutMs: number,
  ): Promise<OrderResult> {
    const deadline = Date.now() + timeoutMs;
    let last: OrderResult | null = null;
    while (Date.now() < deadline) {
      const raw = await this.options.client.getOrder(orderId);
      last = this.mapOrder(raw, clientOrderId);
      if (last.status === 'filled' || last.status === 'canceled' || last.status === 'rejected') {
        return last;
      }
      await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 250));
    }
    return (
      last ?? {
        exchangeOrderId: orderId,
        clientOrderId,
        status: 'open',
        filledQty: 0,
        avgPrice: null,
        fee: 0,
      }
    );
  }

  private mapOrder(raw: RawOrder, clientOrderId: string): OrderResult {
    const status = mapOrderState(raw.state);
    return {
      exchangeOrderId: String(raw.orderId),
      clientOrderId,
      status,
      filledQty: raw.dealVol ?? 0,
      avgPrice: raw.dealAvgPrice ?? null,
      fee: (raw.takerFee ?? 0) + (raw.makerFee ?? 0),
      error: raw.errorCode ? `MEXC error ${raw.errorCode}` : undefined,
      raw,
    };
  }
}
