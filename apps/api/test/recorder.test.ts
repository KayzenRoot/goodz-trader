import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { EventBus } from '../src/services/events';
import { SnapshotRecorder } from '../src/services/snapshot-recorder';
import { testLogger } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function view(ts: number, bid = 100, ask = 101, snapshot = true) {
  return {
    snapshot: snapshot
      ? {
          symbol: 'BTC_USDT',
          ts,
          mid: (bid + ask) / 2,
          bid,
          ask,
          last: (bid + ask) / 2,
          spreadBps: 100,
          imbalance: 0.4,
          tradeDelta: 0.7,
          emaFast: bid,
          emaSlow: bid,
          volatilityBps: 0,
        }
      : null,
    bids: [],
    asks: [],
    tape: [],
    source: 'mexc' as const,
    connected: true,
    lastTickAt: ts,
    latencyMs: 10,
  };
}

function recorder(enabled = true) {
  const dir = mkdtempSync(join(tmpdir(), 'goodz-record-'));
  dirs.push(dir);
  const events = new EventBus();
  const service = new SnapshotRecorder({
    enabled,
    directory: dir,
    eventBus: events,
    logger: testLogger,
    now: () => Date.UTC(2026, 0, 2),
  });
  return { dir, events, service };
}

describe('SnapshotRecorder', () => {
  it('records market snapshots as replay-compatible JSONL', async () => {
    const { dir, events, service } = recorder();
    events.publish('market', view(Date.UTC(2026, 0, 1, 10), 100, 101));
    events.publish('market', view(Date.UTC(2026, 0, 1, 10, 1), 102, 103));
    events.publish('market', view(Date.UTC(2026, 0, 1, 10, 2), 0, 0, false));
    await service.stop();

    const files = readdirSync(dir);
    expect(files).toEqual(['market-2026-01-01.jsonl']);
    const lines = readFileSync(join(dir, files[0] ?? ''), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      bid: 100,
      ask: 101,
      imbalance: 0.4,
      tradeDelta: 0.7,
      source: 'mexc',
    });
    expect(service.stats.records).toBe(2);
  });

  it('rotates files by UTC day and does nothing when disabled', async () => {
    const { dir, events, service } = recorder();
    events.publish('market', view(Date.UTC(2026, 0, 1, 23, 59)));
    events.publish('market', view(Date.UTC(2026, 0, 2, 0, 1)));
    await service.stop();
    expect(readdirSync(dir).sort()).toEqual(['market-2026-01-01.jsonl', 'market-2026-01-02.jsonl']);

    const disabled = recorder(false);
    disabled.events.publish('market', view(Date.UTC(2026, 0, 1, 12)));
    await disabled.service.stop();
    expect(readdirSync(disabled.dir)).toEqual([]);
  });

  it('prunes old snapshot files', async () => {
    const { dir, events, service } = recorder();
    const old = join(dir, 'market-2025-01-01.jsonl');
    writeFileSync(old, '{"ts":1}\n');
    utimesSync(old, new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'));

    events.publish('market', view(Date.UTC(2026, 0, 2, 12)));
    await service.stop();

    expect(readdirSync(dir)).not.toContain('market-2025-01-01.jsonl');
    expect(service.stats.prunedFiles).toBe(1);
  });
});
