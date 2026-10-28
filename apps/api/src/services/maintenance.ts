import type { Repository } from '../db/repo';
import type { AppLogger } from '../lib/logger';

export interface RetentionPolicy {
  logsDays: number;
  equityDays: number;
  auditDays: number;
}

export interface RetentionResult {
  logs: number;
  equity: number;
  audit: number;
}

const DAY_MS = 86_400_000;

/**
 * Applies time-based retention to high-volume tables. Trades/orders are never
 * deleted: they are the ledger. Logs, equity snapshots and old audit rows are
 * pruned so an always-on bot does not grow the SQLite file without bound.
 */
export class MaintenanceService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: Repository,
    private readonly logger: AppLogger,
    private readonly policy: RetentionPolicy,
    private readonly now: () => number = Date.now,
    private readonly intervalMs: number = DAY_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.run();
    this.timer = setInterval(() => this.run(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  run(now = this.now()): RetentionResult {
    const result: RetentionResult = {
      logs: this.repo.deleteLogsBefore(now - this.policy.logsDays * DAY_MS),
      equity: this.repo.deleteEquityBefore(now - this.policy.equityDays * DAY_MS),
      audit: this.repo.deleteAuditBefore(now - this.policy.auditDays * DAY_MS),
    };
    if (result.logs + result.equity + result.audit > 0) {
      this.logger.info('Retenção aplicada', { ...result });
    }
    return result;
  }
}
