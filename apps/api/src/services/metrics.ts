import { createHash, timingSafeEqual } from 'node:crypto';

import type { EngineStatus } from '@goodz/core';

const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

interface HttpObservation {
  count: number;
  sumSeconds: number;
  buckets: number[];
}

export interface MetricsSnapshot {
  version: string;
  now: number;
  status: EngineStatus;
  dbUp: boolean;
}

/**
 * Small, dependency-free Prometheus registry. Labels are deliberately
 * low-cardinality: HTTP route patterns and status classes, never raw URLs,
 * user ids, API keys or symbols with unbounded values.
 */
export class MetricsRegistry {
  private readonly http = new Map<string, HttpObservation>();

  observeHttp(method: string, route: string, status: number, durationMs: number): void {
    const key = `${method.toUpperCase()}|${route}|${statusClass(status)}`;
    const observation = this.http.get(key) ?? {
      count: 0,
      sumSeconds: 0,
      buckets: DURATION_BUCKETS.map(() => 0),
    };
    const seconds = Math.max(0, durationMs) / 1_000;
    observation.count += 1;
    observation.sumSeconds += seconds;
    DURATION_BUCKETS.forEach((bucket, index) => {
      if (seconds <= bucket) observation.buckets[index] = (observation.buckets[index] ?? 0) + 1;
    });
    this.http.set(key, observation);
  }

  render(snapshot: MetricsSnapshot): string {
    const { status } = snapshot;
    const lines: string[] = [];
    const gauge = (name: string, help: string, value: number, labels = '') => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
      lines.push(`${name}${labels} ${formatNumber(value)}`);
    };

    lines.push('# HELP goodz_build_info Build information.', '# TYPE goodz_build_info gauge');
    lines.push(`goodz_build_info{version="${escapeLabel(snapshot.version)}"} 1`);

    gauge('goodz_process_uptime_seconds', 'Process uptime in seconds.', process.uptime());
    gauge('goodz_process_rss_bytes', 'Resident memory in bytes.', process.memoryUsage().rss);
    gauge('goodz_db_up', 'SQLite is reachable (1) or not (0).', snapshot.dbUp ? 1 : 0);
    gauge(
      'goodz_bot_running',
      'Bot is running (1) or not (0).',
      status.status === 'running' ? 1 : 0,
    );
    gauge(
      'goodz_bot_halted',
      'Bot is halted/error (1) or not (0).',
      status.status === 'halted' || status.status === 'error' ? 1 : 0,
    );
    gauge('goodz_equity_usd', 'Current equity in USDT.', status.equity);
    gauge('goodz_day_pnl_usd', 'Day PnL in USDT, net of fees.', status.dayPnl);
    gauge('goodz_day_pnl_pct', 'Day PnL as a percentage of day-start equity.', status.dayPnlPct);
    gauge('goodz_fees_day_usd', 'Fees paid today in USDT.', status.feesDay);
    gauge('goodz_trades_day', 'Closed trades today.', status.tradesDay);
    gauge(
      'goodz_orders_last_minute',
      'Orders submitted in the last 60 seconds.',
      status.ordersLastMinute,
    );
    gauge(
      'goodz_feed_connected',
      'Market feed connected (1) or not (0).',
      status.feed.connected ? 1 : 0,
    );
    const lastTickAt = status.feed.lastTickAt ?? 0;
    const age = lastTickAt > 0 ? Math.max(0, (snapshot.now - lastTickAt) / 1_000) : -1;
    gauge('goodz_feed_staleness_seconds', 'Seconds since the last market tick; -1 if never.', age);
    gauge(
      'goodz_feed_latency_ms',
      'Last feed latency in milliseconds; -1 if unknown.',
      status.feed.latencyMs ?? -1,
    );
    gauge(
      'goodz_api_connected',
      'Private MEXC API connected (1) or not (0).',
      status.api.connected ? 1 : 0,
    );
    gauge(
      'goodz_position_open',
      'An open position exists (1) or not (0).',
      status.position ? 1 : 0,
    );
    gauge('goodz_position_qty', 'Open position quantity in contracts.', status.position?.qty ?? 0);
    gauge(
      'goodz_unrealized_pnl_usd',
      'Unrealized PnL of the open position in USDT.',
      status.position?.unrealizedPnl ?? 0,
    );
    gauge(
      'goodz_maker_fill_rate_pct',
      'Maker fill rate for entries in the current session.',
      status.entryMetrics.makerFillRatePct,
    );
    gauge(
      'goodz_maker_fill_time_ms',
      'Average maker fill time in the current session; -1 if unknown.',
      status.entryMetrics.avgMakerFillMs ?? -1,
    );
    gauge(
      'goodz_requotes',
      'Requotes placed in the current session.',
      status.entryMetrics.requotes,
    );
    gauge(
      'goodz_partial_fills',
      'Entries opened with a partial fill in the current session.',
      status.entryMetrics.partialFills,
    );
    gauge(
      'goodz_taker_fallbacks',
      'Taker fallbacks in the current session.',
      status.entryMetrics.takerFallbacks,
    );
    gauge(
      'goodz_fallback_cost_usd',
      'Estimated fallback fee cost in the current session.',
      status.entryMetrics.fallbackCostUsd,
    );
    if (status.haltReason) {
      lines.push(
        '# HELP goodz_halt_reason_info Current halt reason.',
        '# TYPE goodz_halt_reason_info gauge',
        `goodz_halt_reason_info{reason="${escapeLabel(status.haltReason)}"} 1`,
      );
    }

    lines.push(
      '# HELP goodz_http_requests_total HTTP requests by method, route pattern and status class.',
      '# TYPE goodz_http_requests_total counter',
    );
    for (const [key, observation] of sortedHttp(this.http)) {
      const [method, route, statusClassValue] = key.split('|');
      const labels = `{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${escapeLabel(statusClassValue ?? '')}"}`;
      lines.push(`goodz_http_requests_total${labels} ${observation.count}`);
    }

    lines.push(
      '# HELP goodz_http_request_duration_seconds HTTP request duration by method, route pattern and status class.',
      '# TYPE goodz_http_request_duration_seconds histogram',
    );
    for (const [key, observation] of sortedHttp(this.http)) {
      const [method, route, statusClassValue] = key.split('|');
      const base = `method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${escapeLabel(statusClassValue ?? '')}"`;
      DURATION_BUCKETS.forEach((bucket, index) => {
        lines.push(
          `goodz_http_request_duration_seconds_bucket{${base},le="${bucket}"} ${observation.buckets[index] ?? 0}`,
        );
      });
      lines.push(
        `goodz_http_request_duration_seconds_bucket{${base},le="+Inf"} ${observation.count}`,
      );
      lines.push(
        `goodz_http_request_duration_seconds_sum{${base}} ${formatNumber(observation.sumSeconds)}`,
      );
      lines.push(`goodz_http_request_duration_seconds_count{${base}} ${observation.count}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

export function metricsAuthorized(input: {
  authorization: string | undefined;
  ip: string | undefined;
  token: string | undefined;
  nodeEnv: string;
}): boolean {
  if (input.token) {
    const provided = input.authorization?.startsWith('Bearer ')
      ? input.authorization.slice('Bearer '.length).trim()
      : '';
    if (!provided) return false;
    return safeEqual(provided, input.token);
  }
  if (input.nodeEnv !== 'production') return true;
  return isLoopback(input.ip);
}

function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

function sortedHttp(metrics: Map<string, HttpObservation>): Array<[string, HttpObservation]> {
  return [...metrics.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
