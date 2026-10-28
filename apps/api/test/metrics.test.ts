import { describe, expect, it } from 'vitest';

import { metricsAuthorized, MetricsRegistry } from '../src/services/metrics';
import { idleStatus } from './helpers';

describe('MetricsRegistry', () => {
  it('renders low-cardinality bot, feed and HTTP metrics', () => {
    const registry = new MetricsRegistry();
    registry.observeHttp('GET', '/api/status', 200, 20);
    registry.observeHttp('GET', '/api/status', 200, 80);
    registry.observeHttp('POST', '/api/bot/start', 409, 5);

    const output = registry.render({
      version: '0.1.0',
      now: Date.now(),
      status: idleStatus({ equity: 1_234.5, dayPnl: 12.5 }),
      dbUp: true,
    });

    expect(output).toContain('goodz_build_info{version="0.1.0"} 1');
    expect(output).toContain('goodz_equity_usd 1234.5');
    expect(output).toContain('goodz_bot_running 0');
    expect(output).toContain('goodz_db_up 1');
    expect(output).toContain(
      'goodz_http_requests_total{method="GET",route="/api/status",status="2xx"} 2',
    );
    expect(output).toContain(
      'goodz_http_request_duration_seconds_count{method="GET",route="/api/status",status="2xx"} 2',
    );
    expect(output).toContain(
      'goodz_http_request_duration_seconds_bucket{method="GET",route="/api/status",status="2xx",le="0.05"} 1',
    );
    expect(output).toContain('goodz_feed_staleness_seconds');
    expect(output).not.toContain('apiKey');
  });

  it('escapes label values and avoids NaN output', () => {
    const registry = new MetricsRegistry();
    registry.observeHttp('GET', '/api/trades/:id', 500, Number.NaN);
    const output = registry.render({
      version: '0.1.0 "rc"',
      now: Date.now(),
      status: idleStatus({ haltReason: 'daily_stop' }),
      dbUp: false,
    });
    expect(output).toContain('goodz_build_info{version="0.1.0 \\"rc\\""} 1');
    expect(output).toContain('goodz_halt_reason_info{reason="daily_stop"} 1');
    expect(output).toContain('goodz_db_up 0');
    expect(output).not.toContain('NaN');
  });
});

describe('metricsAuthorized', () => {
  it('accepts only the configured bearer token', () => {
    const base = {
      ip: '203.0.113.10',
      token: '0123456789abcdef',
      nodeEnv: 'production',
    };
    expect(metricsAuthorized({ ...base, authorization: undefined })).toBe(false);
    expect(metricsAuthorized({ ...base, authorization: 'Bearer wrong-token' })).toBe(false);
    expect(metricsAuthorized({ ...base, authorization: 'Bearer 0123456789abcdef' })).toBe(true);
  });

  it('allows loopback or non-production when no token exists', () => {
    expect(
      metricsAuthorized({
        authorization: undefined,
        ip: '127.0.0.1',
        token: undefined,
        nodeEnv: 'production',
      }),
    ).toBe(true);
    expect(
      metricsAuthorized({
        authorization: undefined,
        ip: '::ffff:127.0.0.1',
        token: undefined,
        nodeEnv: 'production',
      }),
    ).toBe(true);
    expect(
      metricsAuthorized({
        authorization: undefined,
        ip: '203.0.113.10',
        token: undefined,
        nodeEnv: 'production',
      }),
    ).toBe(false);
    expect(
      metricsAuthorized({
        authorization: undefined,
        ip: '203.0.113.10',
        token: undefined,
        nodeEnv: 'test',
      }),
    ).toBe(true);
  });
});
