import {
  type CloseResult,
  type ContractSpec,
  type MarketView,
  type OrderRequest,
  type OrderResult,
  type PositionView,
  type Side,
} from '@goodz/core';
import { MexcApiError, type MexcFuturesClient, mapOrderState, type RawOrder } from '@goodz/mexc';

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
}

export class LiveBroker implements Broker {
  readonly mode = 'live' as const;

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
  }

  async disconnect(): Promise<void> {
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
    if (!input.exchangeOrderId) return null;
    const raw = await this.options.client.getOrder(input.exchangeOrderId);
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
