import type { BotEventMap } from '@goodz/core';

export type OutboundEvent = {
  [K in keyof BotEventMap]: { type: K; data: BotEventMap[K]; ts: number };
}[keyof BotEventMap];

export class EventBus {
  private readonly listeners = new Set<(event: OutboundEvent) => void>();

  subscribe(listener: (event: OutboundEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish<K extends keyof BotEventMap>(type: K, data: BotEventMap[K]): void {
    const event = { type, data, ts: Date.now() } as OutboundEvent;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken WebSocket client must never break the trading engine.
      }
    }
  }
}
