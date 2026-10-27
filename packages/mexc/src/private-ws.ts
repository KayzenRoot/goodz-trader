import WebSocket from 'ws';

import { signPayload } from './sign';
import type { RawAsset, RawOrder, RawPosition } from './types';

export interface PrivateLoginPayload {
  apiKey: string;
  reqTime: string;
  signature: string;
}

export interface PrivateWsStatus {
  connected: boolean;
  reconnects: number;
  message: string | null;
}

export type PrivateWsEvent =
  | { type: 'login'; ok: boolean; message?: string }
  | { type: 'error'; message: string }
  | { type: 'order'; data: RawOrder }
  | { type: 'position'; data: RawPosition }
  | { type: 'asset'; data: RawAsset }
  | { type: 'deal'; data: unknown };

export interface PrivateWsOptions {
  url?: string;
  symbol: string;
  login: () => PrivateLoginPayload;
  onOrder: (order: RawOrder) => void;
  onPosition: (position: RawPosition) => void;
  onAsset: (asset: RawAsset) => void;
  onDeal?: (deal: unknown) => void;
  onStatus?: (status: PrivateWsStatus) => void;
  pingIntervalMs?: number;
  reconnectBaseMs?: number;
  WebSocketImpl?: typeof WebSocket;
}

/** MEXC private WS signs only `apiKey + reqTime` (no body param). */
export function buildPrivateLoginPayload(
  apiKey: string,
  apiSecret: string,
  reqTime: string,
): PrivateLoginPayload {
  return {
    apiKey,
    reqTime,
    signature: signPayload(apiKey, apiSecret, reqTime, ''),
  };
}

export function buildPersonalFilter(symbol: string): {
  method: 'personal.filter';
  param: { filters: Array<{ filter: string; rules?: string[] }> };
} {
  return {
    method: 'personal.filter',
    param: {
      filters: [
        { filter: 'order', rules: [symbol] },
        { filter: 'order.deal', rules: [symbol] },
        { filter: 'position', rules: [symbol] },
        { filter: 'asset' },
      ],
    },
  };
}

export function parsePrivateMessage(payload: unknown): PrivateWsEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = payload as { channel?: string; data?: unknown };
  const channel = message.channel;
  if (!channel) return null;

  if (channel === 'rs.login') {
    return { type: 'login', ok: true, message: String(message.data ?? 'success') };
  }
  if (channel === 'rs.error') {
    return { type: 'error', message: String(message.data ?? 'Falha no login private WS') };
  }
  if (channel === 'push.personal.order' && message.data) {
    return { type: 'order', data: message.data as RawOrder };
  }
  if (channel === 'push.personal.position' && message.data) {
    return { type: 'position', data: message.data as RawPosition };
  }
  if (channel === 'push.personal.asset' && message.data) {
    return { type: 'asset', data: message.data as RawAsset };
  }
  if (channel === 'push.personal.order.deal' && message.data) {
    return { type: 'deal', data: message.data };
  }
  return null;
}

/**
 * Private MEXC WS for order/position/asset push. It authenticates with the
 * documented login signature, filters to the active symbol, keeps alive with
 * ping and reconnects with exponential backoff. The broker still uses REST as
 * the source of truth; this stream shortens fill/reconciliation latency.
 */
export class MexcPrivateWs {
  private socket: WebSocket | null = null;
  private readonly WebSocketCtor: typeof WebSocket;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private reconnects = 0;
  private stopped = true;
  private authenticated = false;
  private lastMessageAt = 0;

  constructor(private readonly options: PrivateWsOptions) {
    this.WebSocketCtor = options.WebSocketImpl ?? WebSocket;
  }

  get connected(): boolean {
    return this.authenticated && this.socket?.readyState === this.WebSocketCtor.OPEN;
  }

  get lastTickAt(): number {
    return this.lastMessageAt;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.authenticated = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.emitStatus(false, 'Private WS encerrado');
  }

  private connect(): void {
    if (this.stopped) return;
    try {
      const socket = new this.WebSocketCtor(this.options.url ?? 'wss://contract.mexc.com/edge');
      this.socket = socket;

      socket.on('open', () => {
        this.authenticated = false;
        try {
          this.send({
            subscribe: false,
            method: 'login',
            param: this.options.login(),
          });
        } catch (error) {
          this.emitStatus(false, error instanceof Error ? error.message : String(error));
          socket.close();
        }
      });

      socket.on('message', (raw) => {
        this.lastMessageAt = Date.now();
        this.handleMessage(raw.toString());
      });

      socket.on('error', (error) => {
        this.emitStatus(false, error.message);
      });

      socket.on('close', () => {
        this.authenticated = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.socket = null;
        this.emitStatus(false, 'Private WS fechado');
        this.scheduleReconnect();
      });
    } catch (error) {
      this.emitStatus(false, error instanceof Error ? error.message : String(error));
      this.scheduleReconnect();
    }
  }

  private handleMessage(text: string): void {
    if (text === 'pong') return;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const event = parsePrivateMessage(payload);
    if (!event) return;

    switch (event.type) {
      case 'login':
        if (!event.ok) {
          this.failLogin(event.message ?? 'Login rejeitado');
          return;
        }
        this.authenticated = true;
        // Every successful re-login is a reconciliation point for the broker.
        this.startPing();
        this.send(buildPersonalFilter(this.options.symbol));
        this.emitStatus(true, null);
        break;
      case 'error':
        this.failLogin(event.message);
        break;
      case 'order':
        this.options.onOrder(event.data);
        break;
      case 'position':
        this.options.onPosition(event.data);
        break;
      case 'asset':
        this.options.onAsset(event.data);
        break;
      case 'deal':
        this.options.onDeal?.(event.data);
        break;
    }
  }

  private failLogin(message: string): void {
    this.authenticated = false;
    this.emitStatus(false, message);
    this.socket?.close();
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.send({ method: 'ping' });
    }, this.options.pingIntervalMs ?? 15_000);
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === this.WebSocketCtor.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    this.reconnects += 1;
    const base = this.options.reconnectBaseMs ?? 1_000;
    const delay = Math.min(30_000, base * 2 ** Math.min(this.reconnectAttempts, 5));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private emitStatus(connected: boolean, message: string | null): void {
    this.options.onStatus?.({ connected, reconnects: this.reconnects, message });
  }
}
