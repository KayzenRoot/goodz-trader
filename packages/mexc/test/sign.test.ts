import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildAuthHeaders, buildQuery, signPayload } from '../src';

describe('MEXC signing', () => {
  it('sorts and URL-encodes query parameters', () => {
    expect(buildQuery({ symbol: 'BTC_USDT', limit: 20, start: 10 })).toBe(
      'limit=20&start=10&symbol=BTC_USDT',
    );
    expect(buildQuery({ a: 'x y', b: 'a&b', c: true, d: null, e: undefined })).toBe(
      'a=x%20y&b=a%26b&c=true',
    );
    expect(buildQuery({})).toBe('');
  });

  it('builds the documented HMAC SHA256 signature', () => {
    const signature = signPayload('mx-key', 'mx-secret', '1700000000000', 'symbol=BTC_USDT');
    const expected = createHmac('sha256', 'mx-secret')
      .update('mx-key1700000000000symbol=BTC_USDT')
      .digest('hex');
    expect(signature).toBe(expected);
    expect(signature).toHaveLength(64);
  });

  it('builds authentication headers', () => {
    const headers = buildAuthHeaders({
      apiKey: 'key',
      apiSecret: 'secret',
      timestamp: '123',
      paramString: '',
      recvWindow: 5,
    });
    expect(headers.ApiKey).toBe('key');
    expect(headers['Request-Time']).toBe('123');
    expect(headers['Recv-Window']).toBe('5');
    expect(headers.Signature).toBe(signPayload('key', 'secret', '123', ''));
  });
});
