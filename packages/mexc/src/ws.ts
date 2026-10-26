import WebSocket from 'ws';

import type { Deal } from './types';
import { mapDeal, type RawDeal, type RawTicker } from './types';

export interface PublicWsStatus {
  connected: boolean;
  reconnects: number;
  message: string | null;
}

export interface PublicWsOptions {
  url?: string;
  symbol: string;
  onTicker: (ticker: RawTicker) => void;
  onDeal: (deal: Deal) => void;
  onStatus?: (status: PublicWsStatus) => void;
  pingIntervalMs?: number;
  reconnectBaseMs?: number;
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Minimal MEXC public contract WebSocket client with keepalive and reconnect.
 * It subscribes to the ticker and the trade tape for one symbol. Depth is
 * polled over REST because MEXC's incremental depth requires snapshot +
 * version reconciliation that is deliberately handled by the market service.
 */
export class MexcPublicWs {
  private socket: WebSocket | null = null;
  private readonly WebSocketCtor: typeof WebSocket;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopped = true;
  private reconnects = 0;

  constructor(private readonly options: PublicWsOptions) {
    this.WebSocketCtor = options.WebSocketImpl ?? WebSocket;
  }

  get connected(): boolean {
    return this.socket?.readyState === this.WebSocketCtor.OPEN;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.emitStatus(false, 'Feed encerrado');
  }

  private connect(): void {
    if (this.stopped) return;

    const url = this.options.url ?? 'wss://contract.mexc.com/edge';
    const socket = new this.WebSocketCtor(url);
    this.socket = socket;

    socket.on('open', () => {
      this.reconnectAttempts = 0;
      this.emitStatus(true, null);
      this.subscribe();
      this.pingTimer = setInterval(() => {
        this.send({ method: 'ping' });
      }, this.options.pingIntervalMs ?? 15_000);
    });

    socket.on('message', (raw) => {
      this.handleMessage(raw.toString());
    });

    socket.on('error', (error) => {
      this.emitStatus(false, error.message);
    });

    socket.on('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.socket = null;
      this.emitStatus(false, 'Conexão fechada');
      this.scheduleReconnect();
    });
  }

  private subscribe(): void {
    const { symbol } = this.options;
    this.send({ method: 'sub.ticker', param: { symbol } });
    this.send({ method: 'sub.deal', param: { symbol } });
  }

  private handleMessage(text: string): void {
    if (text === 'pong') return;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const message = payload as { channel?: string; data?: unknown };

    if (message.channel === 'push.ticker' && message.data) {
      this.options.onTicker(message.data as RawTicker);
      return;
    }
    if (message.channel === 'push.deal' && message.data) {
      const raw = message.data as RawDeal;
      this.options.onDeal(mapDeal(raw));
    }
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
