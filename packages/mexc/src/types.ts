import type { Candle, ContractSpec } from '@goodz/core';

export interface MexcEnvelope<T> {
  success: boolean;
  code: number;
  message?: string;
  data: T;
}

export interface RawContract {
  symbol: string;
  displayName?: string;
  baseCoin: string;
  quoteCoin: string;
  settleCoin?: string;
  contractSize: number;
  minLeverage: number;
  maxLeverage: number;
  priceScale: number;
  volScale: number;
  priceUnit?: number;
  volUnit?: number;
  minVol: number;
  maxVol: number;
  makerFeeRate?: number;
  takerFeeRate?: number;
  apiAllowed?: boolean;
}

export interface RawTicker {
  symbol: string;
  lastPrice: number;
  bid1: number;
  ask1: number;
  volume24?: number;
  amount24?: number;
  indexPrice?: number;
  fairPrice?: number;
  fundingRate?: number;
  timestamp: number;
}

export interface RawDepth {
  asks: Array<[number, number, number?]>;
  bids: Array<[number, number, number?]>;
  version: number;
  timestamp: number;
}

export interface RawDeal {
  p: number;
  v: number;
  T: number;
  O?: number;
  M?: number;
  t: number;
}

export interface RawKline {
  time: number[];
  open: number[];
  close: number[];
  high: number[];
  low: number[];
  vol: number[];
}

export interface RawAsset {
  currency: string;
  positionMargin: number;
  availableBalance: number;
  cashBalance: number;
  frozenBalance: number;
  equity: number;
  unrealized: number;
  bonus?: number;
}

export interface RawPosition {
  positionId: number;
  symbol: string;
  positionType: number;
  openType: number;
  state: number;
  holdVol: number;
  frozenVol?: number;
  closeVol?: number;
  holdAvgPrice: number;
  openAvgPrice: number;
  closeAvgPrice?: number;
  liquidatePrice?: number;
  oim?: number;
  im?: number;
  holdFee?: number;
  realised?: number;
  leverage: number;
  createTime?: number;
  updateTime?: number;
  autoAddIm?: boolean;
}

export interface RawOrder {
  orderId: number | string;
  symbol: string;
  positionId?: number;
  price: number;
  vol: number;
  leverage?: number;
  side: number;
  category?: number;
  orderType: number;
  dealAvgPrice?: number;
  dealVol?: number;
  orderMargin?: number;
  takerFee?: number;
  makerFee?: number;
  profit?: number;
  openType: number;
  state: number;
  externalOid?: string;
  errorCode?: number;
  usedMargin?: number;
  createTime?: number;
  updateTime?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  bid: number;
  ask: number;
  volume24: number;
  amount24: number;
  fundingRate: number;
  timestamp: number;
}

export interface Depth {
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
  version: number;
  timestamp: number;
}

export interface Deal {
  price: number;
  qty: number;
  side: 'buy' | 'sell';
  ts: number;
}

export interface ConnectionTestResult {
  serverTime: number;
  offsetMs: number;
  equity: number;
  availableBalance: number;
  currency: string;
  positionMode: number;
  openPositions: number;
  openOrders: number;
}

export function mapContract(raw: RawContract): ContractSpec {
  return {
    symbol: raw.symbol,
    baseCoin: raw.baseCoin,
    quoteCoin: raw.quoteCoin,
    contractSize: raw.contractSize,
    minVol: raw.minVol,
    maxVol: raw.maxVol,
    volUnit: raw.volUnit ?? 1,
    priceUnit: raw.priceUnit ?? 1,
    priceScale: raw.priceScale,
    volScale: raw.volScale,
    minLeverage: raw.minLeverage,
    maxLeverage: raw.maxLeverage,
    makerFeeRate: raw.makerFeeRate ?? 0.0002,
    takerFeeRate: raw.takerFeeRate ?? 0.0006,
    apiAllowed: raw.apiAllowed !== false,
  };
}

export function mapTicker(raw: RawTicker): Ticker {
  return {
    symbol: raw.symbol,
    lastPrice: raw.lastPrice,
    bid: raw.bid1,
    ask: raw.ask1,
    volume24: raw.volume24 ?? 0,
    amount24: raw.amount24 ?? 0,
    fundingRate: raw.fundingRate ?? 0,
    timestamp: raw.timestamp,
  };
}

export function mapDepth(raw: RawDepth): Depth {
  const mapLevel = (level: [number, number, number?]) => ({ price: level[0], qty: level[1] });
  return {
    bids: raw.bids.map(mapLevel),
    asks: raw.asks.map(mapLevel),
    version: raw.version,
    timestamp: raw.timestamp,
  };
}

export function mapDeal(raw: RawDeal): Deal {
  return {
    price: raw.p,
    qty: raw.v,
    side: raw.T === 1 ? 'buy' : 'sell',
    ts: raw.t,
  };
}

export function mapKlines(raw: RawKline): Candle[] {
  return raw.time.map((time, index) => ({
    time,
    open: raw.open[index] ?? 0,
    high: raw.high[index] ?? 0,
    low: raw.low[index] ?? 0,
    close: raw.close[index] ?? 0,
    volume: raw.vol[index] ?? 0,
  }));
}

export function mapOrderState(state: number): 'open' | 'filled' | 'canceled' | 'rejected' {
  if (state === 3) return 'filled';
  if (state === 4) return 'canceled';
  if (state === 5) return 'rejected';
  return 'open';
}
