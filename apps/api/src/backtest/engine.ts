import {
  dayKey,
  evaluateEntry,
  grossPnl,
  MomentumScalper,
  notionalUsd,
  type BotConfig,
  type ContractSpec,
  type Side,
} from '@goodz/core';

import { evaluateExit } from '../bot/exits';
import type { ReplayTick } from './dataset';

export const BACKTEST_VERSION = 1;
const EIGHT_HOURS_MS = 8 * 3_600_000;

export interface BacktestOptions {
  config: BotConfig;
  contract: ContractSpec;
  ticks: ReplayTick[];
  /** Execution delay applied to entries. */
  latencyMs?: number;
  /** Extra edge required before a maker order is assumed filled. */
  makerFillThroughBps?: number;
  maintenanceMarginRate?: number;
  /** Fallback funding rate per 8h when the dataset has no fundingRate. */
  fundingRateBpsPer8h?: number;
}

export interface BacktestTrade {
  id: string;
  side: Side;
  qty: number;
  entryTs: number;
  entryPrice: number;
  entryStyle: 'maker' | 'taker';
  exitTs: number;
  exitPrice: number;
  closeReason: string;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  rMultiple: number;
  liquidation: boolean;
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  winPnl: number;
  lossPnl: number;
  profitFactor: number;
  expectancy: number;
  avgR: number;
  maxDrawdownPct: number;
  feeDragPct: number;
  exposurePct: number;
  liquidations: number;
  makerFills: number;
  takerFallbacks: number;
  blockedEntries: number;
  finalEquity: number;
}

export interface BacktestResult {
  version: number;
  generatedAt: number;
  summary: BacktestMetrics;
  trades: BacktestTrade[];
  equity: Array<{ ts: number; equity: number }>;
  assumptions: string[];
}

interface SimPosition {
  side: Side;
  qty: number;
  entryPrice: number;
  entryTs: number;
  entryFee: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  stopPrice: number;
  takeProfitPrice: number;
  trailingStopPrice: number | null;
  funding: number;
  riskUsd: number;
  contractSize: number;
  entryStyle: 'maker' | 'taker';
}

interface PendingEntry {
  side: Side;
  entryAt: number;
  expiresAt: number;
  limitPrice: number | null;
  qty: number;
  style: 'maker' | 'taker';
}

export function runBacktest(options: BacktestOptions): BacktestResult {
  const { config, contract, ticks } = options;
  const latencyMs = Math.max(0, options.latencyMs ?? 250);
  const makerEdge = (options.makerFillThroughBps ?? 0.5) / 10_000;
  const maintenanceRate = options.maintenanceMarginRate ?? 0.005;
  const fallbackFunding = (options.fundingRateBpsPer8h ?? 0) / 10_000;
  const scalper = new MomentumScalper(config.strategy);
  const startingEquity = config.paper.startingBalance;

  let equity = startingEquity;
  let realized = 0;
  let dayPnl = 0;
  let tradesDay = 0;
  let consecutiveLosses = 0;
  let lastLossAt: number | null = null;
  let day = ticks[0] ? dayKey(ticks[0].ts, config.daily.resetHourUtc) : '';
  let position: SimPosition | null = null;
  let pending: PendingEntry | null = null;
  let lastFundingBucket = Math.floor((ticks[0]?.ts ?? 0) / EIGHT_HOURS_MS);
  let lastTickTs = ticks[0]?.ts ?? 0;
  let peakEquity = startingEquity;
  let maxDrawdownPct = 0;
  let exposureMs = 0;
  let makerFills = 0;
  let takerFallbacks = 0;
  let blockedEntries = 0;
  let liquidations = 0;
  const tradeList: BacktestTrade[] = [];
  const equityPoints: Array<{ ts: number; equity: number }> = [];
  const orderTimestamps: number[] = [];

  for (const tick of ticks) {
    if (dayKey(tick.ts, config.daily.resetHourUtc) !== day) {
      day = dayKey(tick.ts, config.daily.resetHourUtc);
      dayPnl = 0;
      tradesDay = 0;
      consecutiveLosses = 0;
      lastLossAt = null;
    }
    if (position) exposureMs += Math.max(0, tick.ts - lastTickTs);
    lastTickTs = tick.ts;

    const mid = (tick.bid + tick.ask) / 2;
    const fundingBucket = Math.floor(tick.ts / EIGHT_HOURS_MS);
    if (position && fundingBucket > lastFundingBucket) {
      const rate = tick.fundingRate ?? fallbackFunding;
      position.funding += position.notionalUsd * rate * (position.side === 'long' ? -1 : 1);
    }
    lastFundingBucket = fundingBucket;

    if (position) {
      const liquidationPrice = liquidationFor(position, maintenanceRate);
      const liquidated =
        position.side === 'long' ? mid <= liquidationPrice : mid >= liquidationPrice;

      if (liquidated) {
        const close = closePosition(position, tick, 'liquidation', true, config, maintenanceRate);
        const trade = settleTrade(position, close, tick.ts, true);
        tradeList.push(trade);
        applySettlement(trade);
        position = null;
        liquidations += 1;
        continue;
      }

      const exit = evaluateExit(
        {
          side: position.side,
          entryPrice: position.entryPrice,
          stopPrice: position.stopPrice,
          takeProfitPrice: position.takeProfitPrice,
          trailingStopPrice: position.trailingStopPrice,
          openedAt: position.entryTs,
        },
        mid,
        tick.ts,
        config.strategy,
      );
      position.trailingStopPrice = exit.trailingStopPrice;
      if (exit.reason) {
        const close = closePosition(position, tick, exit.reason, false, config, maintenanceRate);
        const trade = settleTrade(position, close, tick.ts, false);
        tradeList.push(trade);
        applySettlement(trade);
        position = null;
        continue;
      }
    }

    if (pending) {
      const signalExpired =
        dayPnl <= -Math.abs(config.daily.lossLimitUsd) ||
        (config.daily.stopOnTarget && dayPnl >= config.daily.profitTargetUsd);
      if (signalExpired) {
        pending = null;
      } else if (tick.ts >= pending.entryAt) {
        const filled =
          pending.style === 'maker' && pending.limitPrice !== null
            ? makerFilled(pending.side, pending.limitPrice, tick, makerEdge)
            : true;
        if (filled) {
          const style = pending.style;
          const price =
            style === 'maker' && pending.limitPrice !== null
              ? pending.limitPrice
              : takerPrice(pending.side, tick, config.execution.slippageBps);
          position = openPosition(pending, price, tick.ts, style, config, contract);
          if (style === 'maker') makerFills += 1;
          pending = null;
        } else if (tick.ts >= pending.expiresAt) {
          if (config.strategy.allowTakerFallback) {
            const price = takerPrice(pending.side, tick, config.execution.slippageBps);
            position = openPosition(pending, price, tick.ts, 'taker', config, contract);
            takerFallbacks += 1;
          }
          pending = null;
        }
      }
    }

    if (!position && !pending) {
      const signal = scalper.next({
        ts: tick.ts,
        mid,
        bid: tick.bid,
        ask: tick.ask,
        imbalance: tick.imbalance,
        tradeDelta: tick.tradeDelta,
      });
      if (signal) {
        const decision = evaluateEntry(
          {
            config,
            contract,
            snapshot: snapshotFromTick(tick, contract.symbol),
            equity,
            availableBalance: equity,
            dayPnl,
            dayTrades: tradesDay,
            consecutiveLosses,
            lastLossAt,
            ordersLastMinute: ordersLastMinute(orderTimestamps, tick.ts),
            openPositions: 0,
            now: tick.ts,
            mode: 'paper',
          },
          signal.side,
        );
        if (decision.allowed) {
          orderTimestamps.push(tick.ts);
          const style = config.strategy.entryStyle === 'maker' ? 'maker' : 'taker';
          pending = {
            side: signal.side,
            entryAt: tick.ts + latencyMs,
            expiresAt: tick.ts + latencyMs + config.strategy.makerTimeoutMs,
            limitPrice: style === 'maker' ? (signal.side === 'long' ? tick.bid : tick.ask) : null,
            qty: decision.qty,
            style,
          };
        } else {
          blockedEntries += 1;
        }
      }
    }

    const markEquity = equity + (position ? unrealized(position, mid, config) : 0);
    peakEquity = Math.max(peakEquity, markEquity);
    if (peakEquity > 0) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peakEquity - markEquity) / peakEquity) * 100);
    }
    if (tradeList.length > 0 && tradeList.at(-1)?.exitTs === tick.ts) {
      equityPoints.push({ ts: tick.ts, equity: round(equity) });
    }
  }

  const totalMs = Math.max(1, (ticks.at(-1)?.ts ?? 0) - (ticks[0]?.ts ?? 0));
  const summary = summarize(tradeList, {
    finalEquity: equity,
    maxDrawdownPct,
    exposurePct: (exposureMs / totalMs) * 100,
    liquidations,
    makerFills,
    takerFallbacks,
    blockedEntries,
  });

  equityPoints.unshift({ ts: ticks[0]?.ts ?? Date.now(), equity: startingEquity });

  function applySettlement(trade: BacktestTrade): void {
    realized = round(realized + trade.netPnl);
    equity = round(startingEquity + realized);
    dayPnl = round(dayPnl + trade.netPnl);
    tradesDay += 1;
    if (trade.netPnl <= 0) {
      consecutiveLosses += 1;
      lastLossAt = trade.exitTs;
    } else {
      consecutiveLosses = 0;
    }
  }

  return {
    version: BACKTEST_VERSION,
    generatedAt: Date.now(),
    summary,
    trades: tradeList,
    equity: equityPoints,
    assumptions: [
      'Snapshots must include order-flow (imbalance/tradeDelta); candles are not fabricated into flow.',
      'Maker fills require the market to trade through the limit by makerFillThroughBps; no queue position is modeled.',
      'Entries are delayed by latencyMs; exits fill at the next observed bid/ask with slippage.',
      'Closing fees are always taker; funding uses the dataset rate or the configured fallback.',
      'Liquidation is approximate (maintenance margin) and stops are evaluated on mid; gaps can fill worse.',
    ],
  };
}

function openPosition(
  pending: PendingEntry,
  price: number,
  ts: number,
  style: 'maker' | 'taker',
  config: BotConfig,
  contract: ContractSpec,
): SimPosition {
  const stopDistance = (price * config.strategy.stopLossBps) / 10_000;
  const notional = notionalUsd(price, pending.qty, contract.contractSize);
  const margin = notional / config.leverage;
  const feeRate = style === 'maker' ? config.execution.feeMaker : config.execution.feeTaker;
  return {
    side: pending.side,
    qty: pending.qty,
    entryPrice: price,
    entryTs: ts,
    entryFee: round(notional * feeRate),
    notionalUsd: notional,
    marginUsd: margin,
    leverage: config.leverage,
    stopPrice:
      pending.side === 'long'
        ? price * (1 - config.strategy.stopLossBps / 10_000)
        : price * (1 + config.strategy.stopLossBps / 10_000),
    takeProfitPrice:
      pending.side === 'long'
        ? price * (1 + config.strategy.takeProfitBps / 10_000)
        : price * (1 - config.strategy.takeProfitBps / 10_000),
    trailingStopPrice: null,
    funding: 0,
    riskUsd: round(pending.qty * stopDistance * contract.contractSize),
    contractSize: contract.contractSize,
    entryStyle: style,
  };
}

function closePosition(
  position: SimPosition,
  tick: ReplayTick,
  reason: string,
  liquidation: boolean,
  config: BotConfig,
  maintenanceRate: number,
): { price: number; fee: number; reason: string; liquidation: boolean } {
  const raw = liquidation
    ? liquidationFor(position, maintenanceRate)
    : position.side === 'long'
      ? tick.bid
      : tick.ask;
  const slipped = liquidation
    ? raw
    : position.side === 'long'
      ? raw * (1 - config.execution.slippageBps / 10_000)
      : raw * (1 + config.execution.slippageBps / 10_000);
  const notional = notionalUsd(slipped, position.qty, position.contractSize);
  return {
    price: slipped,
    fee: round(notional * config.execution.feeTaker),
    reason,
    liquidation,
  };
}

function settleTrade(
  position: SimPosition,
  close: { price: number; fee: number; reason: string; liquidation: boolean },
  exitTs: number,
  liquidation: boolean,
): BacktestTrade {
  const gross = grossPnl(
    position.side,
    position.entryPrice,
    close.price,
    position.qty,
    position.contractSize,
  );
  const fees = round(position.entryFee + close.fee);
  const net = round(gross - fees + position.funding);
  return {
    id: `bt_${exitTs}_${position.side}`,
    side: position.side,
    qty: position.qty,
    entryTs: position.entryTs,
    entryPrice: position.entryPrice,
    entryStyle: position.entryStyle,
    exitTs,
    exitPrice: close.price,
    closeReason: close.reason,
    notionalUsd: position.notionalUsd,
    marginUsd: position.marginUsd,
    leverage: position.leverage,
    grossPnl: round(gross),
    fees,
    funding: round(position.funding),
    netPnl: net,
    rMultiple: position.riskUsd > 0 ? round(net / position.riskUsd) : 0,
    liquidation,
  };
}

function unrealized(position: SimPosition, mark: number, config: BotConfig): number {
  const gross = grossPnl(
    position.side,
    position.entryPrice,
    mark,
    position.qty,
    position.contractSize,
  );
  const exitFee =
    notionalUsd(mark, position.qty, position.contractSize) * config.execution.feeTaker;
  return round(gross - position.entryFee - exitFee + position.funding);
}

function liquidationFor(position: SimPosition, maintenanceRate: number): number {
  return position.side === 'long'
    ? position.entryPrice * (1 - 1 / position.leverage + maintenanceRate)
    : position.entryPrice * (1 + 1 / position.leverage - maintenanceRate);
}

function takerPrice(side: Side, tick: ReplayTick, slippageBps: number): number {
  const factor = slippageBps / 10_000;
  return side === 'long' ? tick.ask * (1 + factor) : tick.bid * (1 - factor);
}

function makerFilled(side: Side, limit: number, tick: ReplayTick, edge: number): boolean {
  return side === 'long' ? tick.ask <= limit * (1 - edge) : tick.bid >= limit * (1 + edge);
}

function ordersLastMinute(timestamps: number[], now: number): number {
  while (timestamps[0] !== undefined && now - timestamps[0] >= 60_000) timestamps.shift();
  return timestamps.length;
}

function snapshotFromTick(tick: ReplayTick, symbol: string) {
  const mid = (tick.bid + tick.ask) / 2;
  return {
    symbol,
    ts: tick.ts,
    mid,
    bid: tick.bid,
    ask: tick.ask,
    last: tick.last,
    spreadBps: ((tick.ask - tick.bid) / mid) * 10_000,
    imbalance: tick.imbalance,
    tradeDelta: tick.tradeDelta,
    emaFast: mid,
    emaSlow: mid,
    volatilityBps: 0,
  };
}

function summarize(
  trades: BacktestTrade[],
  input: {
    finalEquity: number;
    maxDrawdownPct: number;
    exposurePct: number;
    liquidations: number;
    makerFills: number;
    takerFallbacks: number;
    blockedEntries: number;
  },
): BacktestMetrics {
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl <= 0);
  const grossPnl = round(trades.reduce((sum, trade) => sum + trade.grossPnl, 0));
  const fees = round(trades.reduce((sum, trade) => sum + trade.fees, 0));
  const funding = round(trades.reduce((sum, trade) => sum + trade.funding, 0));
  const netPnl = round(trades.reduce((sum, trade) => sum + trade.netPnl, 0));
  const grossWins = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length > 0 ? round((wins.length / trades.length) * 100, 2) : 0,
    grossPnl,
    fees,
    funding,
    netPnl,
    winPnl: round(grossWins),
    lossPnl: round(grossLosses),
    profitFactor: grossLosses > 0 ? round(grossWins / grossLosses, 2) : wins.length > 0 ? 999 : 0,
    expectancy: trades.length > 0 ? round(netPnl / trades.length) : 0,
    avgR:
      trades.length > 0
        ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length)
        : 0,
    maxDrawdownPct: round(input.maxDrawdownPct, 2),
    feeDragPct:
      Math.abs(grossPnl) > 0 ? round((fees / Math.abs(grossPnl)) * 100, 2) : fees > 0 ? 100 : 0,
    exposurePct: round(input.exposurePct, 2),
    liquidations: input.liquidations,
    makerFills: input.makerFills,
    takerFallbacks: input.takerFallbacks,
    blockedEntries: input.blockedEntries,
    finalEquity: round(input.finalEquity),
  };
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}
