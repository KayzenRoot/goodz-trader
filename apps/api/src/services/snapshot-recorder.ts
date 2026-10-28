import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  type WriteStream,
} from 'node:fs';
import { join } from 'node:path';

import type { MarketView } from '@goodz/core';

import type { AppLogger } from '../lib/logger';
import type { EventBus } from './events';

export interface SnapshotRecorderOptions {
  enabled: boolean;
  directory: string;
  logger: AppLogger;
  now?: () => number;
  maxFileBytes?: number;
  keepDays?: number;
  eventBus: EventBus;
}

export interface SnapshotRecorderStats {
  enabled: boolean;
  records: number;
  droppedBackpressure: number;
  rotatedFiles: number;
  prunedFiles: number;
  currentFile: string | null;
}

/**
 * Appends market snapshots as JSONL for later replay/backtest.
 *
 * Recording is best-effort and must never slow the trading loop: when the
 * write stream applies backpressure, frames are dropped and counted instead of
 * blocking. Files rotate daily and at a size cap.
 */
export class SnapshotRecorder {
  private stream: WriteStream | null = null;
  private currentDay = '';
  private currentBytes = 0;
  private rotatedFiles = 0;
  private prunedFiles = 0;
  private records = 0;
  private droppedBackpressure = 0;
  private paused = false;
  private readonly unsubscribe: () => void;
  private readonly now: () => number;
  private readonly maxFileBytes: number;
  private readonly keepDays: number;

  constructor(private readonly options: SnapshotRecorderOptions) {
    this.now = options.now ?? Date.now;
    this.maxFileBytes = Math.max(1_048_576, options.maxFileBytes ?? 256 * 1_048_576);
    this.keepDays = Math.max(1, options.keepDays ?? 14);
    this.unsubscribe = options.eventBus.subscribe((event) => {
      if (event.type === 'market') this.record(event.data);
    });
  }

  get stats(): SnapshotRecorderStats {
    return {
      enabled: this.options.enabled,
      records: this.records,
      droppedBackpressure: this.droppedBackpressure,
      rotatedFiles: this.rotatedFiles,
      prunedFiles: this.prunedFiles,
      currentFile: this.currentFile(),
    };
  }

  record(view: MarketView): void {
    if (!this.options.enabled) return;
    const snapshot = view.snapshot;
    if (!snapshot || !Number.isFinite(snapshot.bid) || !Number.isFinite(snapshot.ask)) return;

    this.ensureStream(snapshot.ts);
    if (!this.stream) return;

    const line = `${JSON.stringify({
      ts: snapshot.ts,
      bid: snapshot.bid,
      ask: snapshot.ask,
      last: snapshot.last,
      imbalance: snapshot.imbalance,
      tradeDelta: snapshot.tradeDelta,
      spreadBps: Number(snapshot.spreadBps.toFixed(4)),
      source: view.source,
    })}\n`;

    if (this.paused) {
      this.droppedBackpressure += 1;
      return;
    }

    this.records += 1;
    this.currentBytes += Buffer.byteLength(line);
    const canContinue = this.stream.write(line);
    if (!canContinue) {
      this.paused = true;
      this.stream.once('drain', () => {
        this.paused = false;
      });
    }
    if (this.currentBytes >= this.maxFileBytes) this.rotate(snapshot.ts);
  }

  async stop(): Promise<void> {
    this.unsubscribe();
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    await new Promise<void>((resolve) => stream.end(resolve));
    this.currentDay = '';
    this.currentBytes = 0;
  }

  private ensureStream(ts: number): void {
    const day = new Date(ts).toISOString().slice(0, 10);
    if (this.stream && day === this.currentDay) return;
    this.closeStream();
    mkdirSync(this.options.directory, { recursive: true });
    this.prune();
    this.currentDay = day;
    this.currentBytes = 0;
    this.stream = createWriteStream(join(this.options.directory, `market-${day}.jsonl`), {
      flags: 'a',
      highWaterMark: 1_048_576,
    });
    this.stream.on('error', (error) => {
      this.options.logger.warn('Falha ao gravar snapshot de mercado', {
        error: error.message,
      });
      this.stream = null;
    });
  }

  private rotate(ts: number): void {
    this.rotatedFiles += 1;
    this.closeStream();
    this.currentDay = '';
    this.ensureStream(ts);
  }

  private closeStream(): void {
    if (this.stream) this.stream.end();
    this.stream = null;
    this.paused = false;
  }

  private prune(): void {
    const cutoff = this.now() - this.keepDays * 86_400_000;
    try {
      for (const name of readdirSync(this.options.directory)) {
        if (!/^market-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
        const path = join(this.options.directory, name);
        if (statSync(path).mtimeMs < cutoff) {
          unlinkSync(path);
          this.prunedFiles += 1;
        }
      }
    } catch (error) {
      this.options.logger.warn('Falha ao aplicar retenção de snapshots', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private currentFile(): string | null {
    return this.currentDay ? join(this.options.directory, `market-${this.currentDay}.jsonl`) : null;
  }
}
