import type { ContractSpec } from '@goodz/core';

const FALLBACKS: Record<string, ContractSpec> = {
  BTC_USDT: {
    symbol: 'BTC_USDT',
    baseCoin: 'BTC',
    quoteCoin: 'USDT',
    contractSize: 0.0001,
    minVol: 1,
    maxVol: 5_000_000,
    volUnit: 1,
    priceUnit: 0.5,
    priceScale: 2,
    volScale: 0,
    minLeverage: 1,
    maxLeverage: 125,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    apiAllowed: true,
  },
  ETH_USDT: {
    symbol: 'ETH_USDT',
    baseCoin: 'ETH',
    quoteCoin: 'USDT',
    contractSize: 0.01,
    minVol: 1,
    maxVol: 1_000_000,
    volUnit: 1,
    priceUnit: 0.01,
    priceScale: 2,
    volScale: 0,
    minLeverage: 1,
    maxLeverage: 200,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    apiAllowed: true,
  },
  SOL_USDT: {
    symbol: 'SOL_USDT',
    baseCoin: 'SOL',
    quoteCoin: 'USDT',
    contractSize: 1,
    minVol: 1,
    maxVol: 1_000_000,
    volUnit: 1,
    priceUnit: 0.001,
    priceScale: 3,
    volScale: 0,
    minLeverage: 1,
    maxLeverage: 100,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    apiAllowed: true,
  },
};

export function fallbackContract(symbol: string): ContractSpec {
  if (FALLBACKS[symbol]) return FALLBACKS[symbol];
  const [base = symbol.split('_')[0] ?? 'TOKEN'] = symbol.split('_');
  return {
    symbol,
    baseCoin: base,
    quoteCoin: 'USDT',
    contractSize: 1,
    minVol: 1,
    maxVol: 1_000_000,
    volUnit: 1,
    priceUnit: 0.0001,
    priceScale: 4,
    volScale: 0,
    minLeverage: 1,
    maxLeverage: 20,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    apiAllowed: true,
  };
}

export function basePriceFor(symbol: string): number {
  const [base] = symbol.split('_');
  const prices: Record<string, number> = {
    BTC: 100_000,
    ETH: 3_500,
    SOL: 180,
    XRP: 2.2,
    DOGE: 0.25,
    ADA: 0.8,
    AVAX: 35,
    LINK: 18,
  };
  return prices[base ?? ''] ?? 100;
}

export function isKnownContract(symbol: string): boolean {
  return Boolean(FALLBACKS[symbol]);
}
