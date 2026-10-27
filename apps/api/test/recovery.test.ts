import type { Trade } from '@goodz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, type Harness } from './harness';

const now = Date.now();

function openTrade(): Trade {
  return {
    id: 'trd_recovery',
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'open',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: 100_000,
    exitPrice: null,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0.06,
    grossPnl: 0,
    netPnl: 0,
    rMultiple: 0,
    riskUsd: 0.14,
    openReason: 'crash recovery drill',
    closeReason: '',
    openedAt: now - 30_000,
    closedAt: null,
    createdAt: now - 30_000,
    updatedAt: now - 30_000,
    isDemo: false,
    meta: { stopPrice: 99_900, takeProfitPrice: 100_200 },
  };
}

describe('crash recovery drill', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('adopts a persisted paper position, then closes it cleanly', async () => {
    harness.repo.insertTrade(openTrade());
    harness.engine.bootstrap();

    const adopted = harness.engine.getStatus();
    expect(adopted.position).toMatchObject({ id: 'trd_recovery', side: 'long', qty: 10 });
    expect(adopted.status).toBe('stopped');

    const start = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: {},
    });
    expect(start.statusCode).toBe(202);
    expect(start.json().status).toBe('running');
    expect(start.json().position).toMatchObject({ id: 'trd_recovery' });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const stop = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/stop',
      payload: { closePosition: true },
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().status).toBe('stopped');
    expect(stop.json().position).toBeNull();
    expect(harness.repo.getTrade('trd_recovery')?.status).toBe('closed');
  });
});
