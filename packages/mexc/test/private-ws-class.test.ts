import type WebSocket from 'ws';
import { describe, expect, it } from 'vitest';

import type { RawAsset, RawOrder, RawPosition } from '../src';
import { MexcPrivateWs, type PrivateWsStatus } from '../src';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  static OPEN = 1;
  static readonly instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: unknown[] = [];
  private readonly handlers = new Map<string, Handler[]>();

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  send(value: string): void {
    this.sent.push(JSON.parse(value) as unknown);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  message(payload: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(payload)));
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const order: RawOrder = {
  orderId: 1,
  symbol: 'BTC_USDT',
  price: 100,
  vol: 1,
  side: 1,
  orderType: 5,
  openType: 1,
  state: 3,
  externalOid: 'gz_1',
};
const position: RawPosition = {
  positionId: 2,
  symbol: 'BTC_USDT',
  positionType: 1,
  openType: 1,
  state: 1,
  holdVol: 1,
  holdAvgPrice: 100,
  openAvgPrice: 100,
  leverage: 10,
};
const asset: RawAsset = {
  currency: 'USDT',
  positionMargin: 0,
  availableBalance: 100,
  cashBalance: 100,
  frozenBalance: 0,
  equity: 100,
  unrealized: 0,
};

function makeWs(callbacks: {
  onOrder?: (value: RawOrder) => void;
  onPosition?: (value: RawPosition) => void;
  onAsset?: (value: RawAsset) => void;
  onStatus?: (value: PrivateWsStatus) => void;
}) {
  return new MexcPrivateWs({
    url: 'wss://test.invalid/edge',
    symbol: 'BTC_USDT',
    login: () => ({ apiKey: 'k', reqTime: '1', signature: 's' }),
    onOrder: callbacks.onOrder ?? (() => undefined),
    onPosition: callbacks.onPosition ?? (() => undefined),
    onAsset: callbacks.onAsset ?? (() => undefined),
    onStatus: callbacks.onStatus,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    reconnectBaseMs: 1,
    pingIntervalMs: 60_000,
  });
}

describe('MexcPrivateWs', () => {
  it('logs in, filters, emits pushes and stops', () => {
    FakeSocket.instances.length = 0;
    const statuses: PrivateWsStatus[] = [];
    const orders: RawOrder[] = [];
    const positions: RawPosition[] = [];
    const assets: RawAsset[] = [];
    const ws = makeWs({
      onOrder: (value) => orders.push(value),
      onPosition: (value) => positions.push(value),
      onAsset: (value) => assets.push(value),
      onStatus: (value) => statuses.push(value),
    });

    ws.start();
    const socket = FakeSocket.instances[0];
    expect(socket).toBeDefined();
    socket?.open();
    expect(socket?.sent[0]).toMatchObject({ method: 'login', subscribe: false });
    socket?.message({ channel: 'rs.login', data: 'success' });
    expect(ws.connected).toBe(true);
    expect(socket?.sent[1]).toMatchObject({ method: 'personal.filter' });

    socket?.message({ channel: 'push.personal.order', data: order });
    socket?.message({ channel: 'push.personal.position', data: position });
    socket?.message({ channel: 'push.personal.asset', data: asset });
    expect(orders).toHaveLength(1);
    expect(positions).toHaveLength(1);
    expect(assets).toHaveLength(1);
    expect(statuses.at(-1)?.connected).toBe(true);

    ws.stop();
    expect(ws.connected).toBe(false);
  });

  it('reconnects after a close and rejects bad login', async () => {
    FakeSocket.instances.length = 0;
    const statuses: PrivateWsStatus[] = [];
    const ws = makeWs({ onStatus: (value) => statuses.push(value) });
    ws.start();
    const first = FakeSocket.instances[0];
    first?.open();
    first?.message({ channel: 'rs.error', data: 'bad signature' });
    expect(statuses.at(-1)?.connected).toBe(false);
    expect(first?.readyState).toBe(3);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
    ws.stop();
    expect(ws.connected).toBe(false);
  });
});
