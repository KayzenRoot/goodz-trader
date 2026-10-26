import type { EngineStatus, EquityPoint, LogEntry, MarketView, Trade } from '@goodz/core';
import { create } from 'zustand';

import type { LiveEvent } from '@/lib/types';

interface LiveState {
  connected: boolean;
  status: EngineStatus | null;
  market: MarketView | null;
  trades: Trade[];
  logs: LogEntry[];
  equity: EquityPoint[];
  lastEventAt: number;
  setConnected: (connected: boolean) => void;
  applyEvent: (event: LiveEvent) => void;
  reset: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  connected: false,
  status: null,
  market: null,
  trades: [],
  logs: [],
  equity: [],
  lastEventAt: 0,

  setConnected: (connected) => set({ connected }),

  applyEvent: (event) =>
    set((state) => {
      const next = { ...state, lastEventAt: event.ts };
      switch (event.type) {
        case 'status':
          next.status = event.data;
          break;
        case 'market':
          next.market = event.data;
          break;
        case 'trade': {
          const existing = state.trades.filter((trade) => trade.id !== event.data.id);
          next.trades = [event.data, ...existing].slice(0, 100);
          break;
        }
        case 'log':
          next.logs = [event.data, ...state.logs.filter((log) => log.id !== event.data.id)].slice(
            0,
            300,
          );
          break;
        case 'equity':
          next.equity = [...state.equity, event.data].slice(-1_000);
          break;
        case 'config':
          break;
        case 'heartbeat':
          break;
        default:
          break;
      }
      return next;
    }),

  reset: () =>
    set({
      connected: false,
      status: null,
      market: null,
      trades: [],
      logs: [],
      equity: [],
      lastEventAt: 0,
    }),
}));
