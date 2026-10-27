import { describe, expect, it } from 'vitest';

import {
  buildPersonalFilter,
  buildPrivateLoginPayload,
  parsePrivateMessage,
  signPayload,
} from '../src';

describe('MEXC private WS helpers', () => {
  it('signs apiKey + reqTime only', () => {
    const payload = buildPrivateLoginPayload('mx-key', 'mx-secret', '1700000000000');
    expect(payload).toEqual({
      apiKey: 'mx-key',
      reqTime: '1700000000000',
      signature: signPayload('mx-key', 'mx-secret', '1700000000000', ''),
    });
  });

  it('filters the active symbol and asset', () => {
    const filter = buildPersonalFilter('BTC_USDT');
    expect(filter.method).toBe('personal.filter');
    expect(filter.param.filters).toEqual([
      { filter: 'order', rules: ['BTC_USDT'] },
      { filter: 'order.deal', rules: ['BTC_USDT'] },
      { filter: 'position', rules: ['BTC_USDT'] },
      { filter: 'asset' },
    ]);
  });

  it('maps private push channels', () => {
    expect(parsePrivateMessage({ channel: 'rs.login', data: 'success' })).toMatchObject({
      type: 'login',
      ok: true,
    });
    expect(parsePrivateMessage({ channel: 'rs.error', data: 'bad signature' })).toEqual({
      type: 'error',
      message: 'bad signature',
    });
    expect(
      parsePrivateMessage({
        channel: 'push.personal.order',
        data: { orderId: 1, symbol: 'BTC_USDT', state: 3 },
      }),
    ).toMatchObject({ type: 'order', data: { orderId: 1 } });
    expect(
      parsePrivateMessage({
        channel: 'push.personal.position',
        data: { positionId: 1, symbol: 'BTC_USDT' },
      }),
    ).toMatchObject({ type: 'position' });
    expect(
      parsePrivateMessage({
        channel: 'push.personal.asset',
        data: { currency: 'USDT' },
      }),
    ).toMatchObject({ type: 'asset' });
    expect(parsePrivateMessage({ channel: 'unknown' })).toBeNull();
    expect(parsePrivateMessage(null)).toBeNull();
  });
});
