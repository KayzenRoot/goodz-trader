import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase, type Db } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { MaintenanceService } from '../src/services/maintenance';
import { testLogger } from './helpers';

const now = Date.now();
const DAY = 86_400_000;

let db: Db;
let repo: Repository;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new Repository(db);
});

afterEach(() => {
  closeDatabase(db);
});

describe('MaintenanceService retention', () => {
  it('prunes old logs, equity and audit while keeping the ledger', () => {
    const old = now - 2 * DAY;
    const fresh = now - 60_000;

    db.prepare('INSERT INTO logs (ts, level, category, message, data) VALUES (?, ?, ?, ?, ?)').run(
      old,
      'info',
      'test',
      'old log',
      null,
    );
    db.prepare('INSERT INTO logs (ts, level, category, message, data) VALUES (?, ?, ?, ?, ?)').run(
      fresh,
      'info',
      'test',
      'fresh log',
      null,
    );
    repo.insertEquity({
      ts: old,
      equity: 100,
      balance: 100,
      unrealized: 0,
      dayPnl: 0,
    });
    repo.insertEquity({
      ts: fresh,
      equity: 110,
      balance: 110,
      unrealized: 0,
      dayPnl: 10,
    });
    repo.insertAudit({ ts: old, actor: 'test', action: 'old', detail: '{}', ip: null });
    repo.insertAudit({ ts: fresh, actor: 'test', action: 'fresh', detail: '{}', ip: null });

    const service = new MaintenanceService(
      repo,
      testLogger,
      { logsDays: 1, equityDays: 1, auditDays: 1 },
      () => now,
    );

    const result = service.run();

    expect(result).toEqual({ logs: 1, equity: 1, audit: 1 });
    expect(repo.listLogs({ limit: 100 }).map((log) => log.message)).toEqual(['fresh log']);
    expect(repo.listEquity(0).map((point) => point.equity)).toEqual([110]);
    expect(repo.listAudit(100).map((entry) => entry.action)).toEqual(['fresh']);
  });

  it('runs once at start and can be stopped', () => {
    const service = new MaintenanceService(
      repo,
      testLogger,
      { logsDays: 1, equityDays: 1, auditDays: 1 },
      () => now,
      1_000,
    );
    const run = vi.spyOn(service, 'run');
    service.start();
    service.start();
    expect(run).toHaveBeenCalledTimes(1);
    service.stop();
    service.stop();
  });
});
