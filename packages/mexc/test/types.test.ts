import { describe, expect, it } from 'vitest';

import {
  mapContract,
  mapDeal,
  mapDepth,
  mapKlines,
  mapOrderState,
  mapTicker,
  type RawContract,
} from '../src';

const rawContract: RawContract = {
  symbol: 'BTC_USDT',
  baseCoin: 'BTC',
  quoteCoin: 'USDT',
  contractSize: 0.0001,
  minLeverage: 1,
  maxLeverage: 125,
  priceScale: 2,
  volScale: 0,
  priceUnit: 0.5,
  volUnit: 1,
  minVol: 1,
  maxVol: 5_000_000,
  makerFeeRate: 0.0002,
  takerFeeRate: 0.0006,
  apiAllowed: true,
};

describe('MEXC mappers', () => {
  it('maps contract metadata', () => {
    expect(mapContract(rawContract)).toMatchObject({
      symbol: 'BTC_USDT',
      contractSize: 0.0001,
      maxLeverage: 125,
      apiAllowed: true,
    });
    expect(mapContract({ ...rawContract, apiAllowed: false }).apiAllowed).toBe(false);
    expect(mapContract({ ...rawContract, apiAllowed: undefined }).apiAllowed).toBe(true);
  });

  it('maps tickers, depth, deals and klines', () => {
    expect(
      mapTicker({
        symbol: 'BTC_USDT',
        lastPrice: 100,
        bid1: 99,
        ask1: 101,
        timestamp: 1,
      }),
    ).toMatchObject({ bid: 99, ask: 101, volume24: 0 });
    expect(
      mapDepth({
        bids: [[99, 1, 2]],
        asks: [[101, 2]],
        version: 1,
        timestamp: 1,
      }),
    ).toEqual({
      bids: [{ price: 99, qty: 1 }],
      asks: [{ price: 101, qty: 2 }],
      version: 1,
      timestamp: 1,
    });
    expect(mapDeal({ p: 100, v: 2, T: 1, t: 1 })).toEqual({
      price: 100,
      qty: 2,
      side: 'buy',
      ts: 1,
    });
    expect(mapDeal({ p: 100, v: 2, T: 2, t: 1 }).side).toBe('sell');
    expect(
      mapKlines({
        time: [1],
        open: [10],
        high: [12],
        low: [9],
        close: [11],
        vol: [5],
      }),
    ).toEqual([{ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 5 }]);
  });

  it('maps order states', () => {
    expect(mapOrderState(1)).toBe('open');
    expect(mapOrderState(2)).toBe('open');
    expect(mapOrderState(3)).toBe('filled');
    expect(mapOrderState(4)).toBe('canceled');
    expect(mapOrderState(5)).toBe('rejected');
  });
});
