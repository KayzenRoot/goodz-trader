import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function timestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function openExisting(path) {
  try {
    statSync(path);
  } catch {
    throw new Error(`Banco não encontrado: ${path}`);
  }
  return new Database(path, { readonly: true, fileMustExist: true });
}

function verify(path) {
  const db = openExisting(path);
  try {
    const integrity = String(db.pragma('integrity_check', { simple: true }));
    if (integrity !== 'ok') throw new Error(`integrity_check falhou: ${integrity}`);
    const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    return {
      integrity,
      trades: count('trades'),
      orders: count('orders'),
      equity: count('equity_snapshots'),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('integrity_check')) throw error;
    throw new Error(`Backup inválido: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db.close();
  }
}

function prune(backupDir, keep) {
  const files = readdirSync(backupDir)
    .filter((name) => /^goodz-.*\.db$/.test(name))
    .sort();
  const excess = files.slice(0, Math.max(0, files.length - keep));
  for (const file of excess) rmSync(join(backupDir, file), { force: true });
  return excess.length;
}

/**
 * WAL-safe backup using SQLite's online backup API, followed by an integrity
 * check and row-count verification. Old backups are pruned by timestamp name.
 */
export async function backupDatabase({ sourcePath, backupDir, keep = 14, now = new Date() }) {
  const source = resolve(sourcePath);
  const dir = resolve(backupDir);
  mkdirSync(dir, { recursive: true });

  const destination = join(dir, `goodz-${timestamp(now)}.db`);
  const db = openExisting(source);
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }

  const verified = verify(destination);
  const bytes = statSync(destination).size;
  const pruned = prune(dir, Math.max(1, keep));
  return { path: destination, bytes, ...verified, pruned };
}

/**
 * Restores a verified backup over the target database. Stop the API first:
 * replacing a live SQLite file is not safe while connections are open.
 */
export function restoreDatabase({ backupPath, targetPath }) {
  const source = resolve(backupPath);
  const target = resolve(targetPath);
  if (source === target) throw new Error('Backup e destino não podem ser o mesmo arquivo');

  const verified = verify(source);
  mkdirSync(dirname(target), { recursive: true });

  const temp = `${target}.restore-${process.pid}.tmp`;
  try {
    copyFileSync(source, temp);
    rmSync(target, { force: true });
    rmSync(`${target}-wal`, { force: true });
    rmSync(`${target}-shm`, { force: true });
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }

  const restored = verify(target);
  return { path: target, ...restored };
}
