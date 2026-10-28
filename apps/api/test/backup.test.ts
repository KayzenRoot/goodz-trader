import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { backupDatabase, restoreDatabase } from '../scripts/backup-lib.mjs';
import { closeDatabase, openDatabase } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { sampleClosedTrade } from './helpers';

const now = Date.now();
let dirs: string[] = [];

function tempWorkspace(prefix: string): { dir: string; source: string; backupDir: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return { dir, source: join(dir, 'goodz.db'), backupDir: join(dir, 'backups') };
}

function seedSource(source: string, withData = true): void {
  const db = openDatabase(source);
  if (withData) {
    const repo = new Repository(db);
    repo.insertTrade(sampleClosedTrade({ id: 'trd_backup', openReason: 'backup test' }));
    repo.insertEquity({ ts: now, equity: 1_000, balance: 1_000, unrealized: 0, dayPnl: 0 });
  }
  closeDatabase(db);
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('backup and restore', () => {
  it('creates a verified WAL-safe backup and restores it with counts intact', async () => {
    const { dir, source, backupDir } = tempWorkspace('goodz-backup-');
    seedSource(source);

    const backup = await backupDatabase({ sourcePath: source, backupDir, keep: 2 });
    expect(backup.integrity).toBe('ok');
    expect(backup).toMatchObject({ trades: 1, orders: 0, equity: 1 });
    expect(backup.bytes).toBeGreaterThan(0);

    const restored = join(dir, 'restored.db');
    const result = restoreDatabase({ backupPath: backup.path, targetPath: restored });
    expect(result).toMatchObject({ trades: 1, orders: 0, equity: 1 });

    const restoredDb = new Database(restored, { readonly: true });
    expect(
      restoredDb.prepare('SELECT net_pnl FROM trades WHERE id = ?').get('trd_backup'),
    ).toMatchObject({ net_pnl: 0.42 });
    restoredDb.close();
  });

  it('prunes old backups by timestamp', async () => {
    const { source, backupDir } = tempWorkspace('goodz-prune-');
    seedSource(source, false);

    for (const date of [
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      new Date('2026-01-03T00:00:00Z'),
    ]) {
      await backupDatabase({ sourcePath: source, backupDir, keep: 2, now: date });
    }

    const files = readdirSync(backupDir).filter((name) => name.endsWith('.db'));
    expect(files).toEqual([
      'goodz-2026-01-02T00-00-00-000Z.db',
      'goodz-2026-01-03T00-00-00-000Z.db',
    ]);
  });

  it('refuses an invalid source instead of producing a broken backup', async () => {
    const { dir, backupDir } = tempWorkspace('goodz-invalid-');
    await expect(
      backupDatabase({ sourcePath: join(dir, 'missing.db'), backupDir }),
    ).rejects.toThrow('Banco não encontrado');
  });
});
