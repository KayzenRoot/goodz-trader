import { gaussian, mulberry32, notionalUsd, type BotConfig, type Trade } from '@goodz/core';

import type { Repository } from '../db/repo';

const DAY_MS = 86_400_000;

/**
 * Seeds a deterministic paper-trading history so the dashboard is useful on a
 * fresh clone. It is only called when SEED_DEMO is enabled and the trades table
 * is empty. Every seeded row is marked is_demo = 1 and surfaced in the UI.
 */
export function seedDemoData(repo: Repository, config: BotConfig, now = Date.now()): number {
  if (repo.countTrades() > 0) return 0;

  const rng = mulberry32(7);
  const contractSize = 0.0001;
  const feesRate = config.execution.feeMaker + config.execution.feeTaker;
  let equity = config.paper.startingBalance;
  let inserted = 0;
  const equityPoints: Array<{ ts: number; equity: number }> = [];

  for (let dayOffset = 20; dayOffset >= 0; dayOffset -= 1) {
    const dayStart = new Date(now - dayOffset * DAY_MS);
    dayStart.setUTCHours(0, 0, 0, 0);
    const startEquity = equity;
    const tradesToday = 5 + Math.floor(rng() * 12);
    let dayPnl = 0;
    let dayFees = 0;
    let wins = 0;
    let losses = 0;

    for (let index = 0; index < tradesToday; index += 1) {
      const openedAt =
        dayStart.getTime() +
        9 * 3_600_000 +
        Math.floor(rng() * 10 * 3_600_000) +
        Math.floor(rng() * 60_000);
      if (openedAt > now - 60_000) continue;
      const holdSec = 20 + Math.floor(rng() * 180);
      const closedAt = openedAt + holdSec * 1_000;
      const side = rng() > 0.5 ? 'long' : 'short';
      const win = rng() < 0.57;
      const r = win ? 0.55 + rng() * 1.65 : -(0.55 + rng() * 0.55);
      const riskUsd = 1.2 + rng() * 2.8;
      const netPnl = Number((r * riskUsd).toFixed(6));
      const entryPrice = 96_000 + rng() * 8_000;
      const qty = Math.max(1, Math.round((180 + rng() * 280) / (entryPrice * contractSize)));
      const notional = notionalUsd(entryPrice, qty, contractSize);
      const fees = Number((notional * feesRate).toFixed(6));
      const gross = netPnl + fees;
      const direction = side === 'long' ? 1 : -1;
      const exitPrice = Number(
        Math.max(1, entryPrice + (gross / (qty * contractSize)) * direction).toFixed(2),
      );
      const closeReason = win
        ? rng() > 0.55
          ? 'take_profit'
          : 'trailing_stop'
        : rng() > 0.5
          ? 'stop_loss'
          : 'time_stop';

      const trade: Trade = {
        id: `demo_${dayOffset}_${index}`,
        mode: 'paper',
        symbol: config.primarySymbol,
        side,
        status: 'closed',
        qty,
        contractSize,
        entryPrice: Number(entryPrice.toFixed(2)),
        exitPrice,
        notionalUsd: Number(notional.toFixed(4)),
        marginUsd: Number((notional / config.leverage).toFixed(4)),
        leverage: config.leverage,
        fees,
        grossPnl: Number(gross.toFixed(6)),
        netPnl,
        rMultiple: Number(r.toFixed(4)),
        riskUsd,
        openReason: 'demo momentum+flow',
        closeReason,
        openedAt,
        closedAt,
        createdAt: openedAt,
        updatedAt: closedAt,
        isDemo: true,
        meta: { demo: true, holdSec },
      };
      repo.insertTrade(trade);
      inserted += 1;
      dayPnl += netPnl;
      dayFees += fees;
      equity += netPnl;
      if (netPnl > 0) wins += 1;
      else losses += 1;
    }

    repo.upsertDailyStats({
      dayKey: dayStart.toISOString().slice(0, 10),
      startEquity: Number(startEquity.toFixed(4)),
      endEquity: Number(equity.toFixed(4)),
      realizedPnl: Number(dayPnl.toFixed(4)),
      fees: Number(dayFees.toFixed(4)),
      trades: wins + losses,
      wins,
      losses,
      targetHit: dayPnl >= config.daily.profitTargetUsd,
      stopHit: dayPnl <= -config.daily.lossLimitUsd,
      maxDrawdownPct: 0,
      updatedAt: closedAtOrNow(dayStart.getTime(), now),
    });

    equityPoints.push({ ts: dayStart.getTime() + 23 * 3_600_000, equity });
  }

  const start = now - 21 * DAY_MS;
  for (let ts = start; ts <= now; ts += 3_600_000) {
    const progress = (ts - start) / (now - start);
    const anchor =
      equityPoints[Math.min(equityPoints.length - 1, Math.floor(progress * equityPoints.length))];
    const noise = gaussian(rng) * 0.6;
    repo.insertEquity({
      ts,
      equity: Number(((anchor?.equity ?? equity) + noise).toFixed(4)),
      balance: Number(
        (config.paper.startingBalance + (equity - config.paper.startingBalance) * progress).toFixed(
          4,
        ),
      ),
      unrealized: 0,
      dayPnl: 0,
    });
  }

  return inserted;
}

function closedAtOrNow(dayStart: number, now: number): number {
  return Math.min(now, dayStart + 23 * 3_600_000);
}
