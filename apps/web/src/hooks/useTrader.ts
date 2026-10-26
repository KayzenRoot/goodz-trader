import type { BotMode, LogEntry, TradeStatus } from '@goodz/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import { useLiveStore } from '@/store/live';

export function useStatus() {
  const connected = useLiveStore((state) => state.connected);
  const live = useLiveStore((state) => state.status);
  const query = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 5_000,
  });
  return connected ? (live ?? query.data ?? null) : (query.data ?? live ?? null);
}

export function useMarket() {
  const connected = useLiveStore((state) => state.connected);
  const live = useLiveStore((state) => state.market);
  const query = useQuery({
    queryKey: ['market'],
    queryFn: api.market,
    refetchInterval: 2_000,
  });
  return connected ? (live ?? query.data ?? null) : (query.data ?? live ?? null);
}

export function useMetrics(days = 30, mode?: BotMode) {
  return useQuery({
    queryKey: ['metrics', days, mode],
    queryFn: () => api.metrics(days, mode),
    refetchInterval: 15_000,
  });
}

export function useAnalytics(days = 30, mode?: BotMode) {
  return useQuery({
    queryKey: ['analytics', days, mode],
    queryFn: () => api.analytics(days, mode),
    refetchInterval: 30_000,
  });
}

export function useTrades(params: {
  limit?: number;
  offset?: number;
  status?: TradeStatus;
  symbol?: string;
  mode?: BotMode;
}) {
  return useQuery({
    queryKey: ['trades', params],
    queryFn: () => api.trades(params),
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
  });
}

export function useTrade(id: string | null) {
  return useQuery({
    queryKey: ['trade', id],
    queryFn: () => api.trade(id as string),
    enabled: Boolean(id),
  });
}

export function useOpenOrders() {
  return useQuery({
    queryKey: ['orders', 'open'],
    queryFn: api.openOrders,
    refetchInterval: 5_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    refetchInterval: 30_000,
  });
}

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: api.authMe,
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogs(filters: { level?: string; category?: string; limit?: number }) {
  const query = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => api.logs(filters),
    refetchInterval: 15_000,
  });
  const liveLogs = useLiveStore((state) => state.logs);

  return useMemo(() => {
    const merged = new Map<number, LogEntry>();
    for (const log of query.data?.items ?? []) merged.set(log.id, log);
    for (const log of liveLogs) merged.set(log.id, log);
    return [...merged.values()]
      .filter((log) => (filters.level ? log.level === filters.level : true))
      .filter((log) => (filters.category ? log.category === filters.category : true))
      .sort((a, b) => b.id - a.id)
      .slice(0, filters.limit ?? 200);
  }, [filters.category, filters.level, filters.limit, liveLogs, query.data]);
}

export function useAudit(limit = 100) {
  return useQuery({
    queryKey: ['audit', limit],
    queryFn: () => api.audit(limit),
    refetchInterval: 30_000,
  });
}

export function useContract(symbol: string) {
  return useQuery({
    queryKey: ['contract', symbol],
    queryFn: () => api.contract(symbol),
    staleTime: 60_000,
  });
}

export function useCandles(symbol: string, interval = 'Min1') {
  return useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: () => api.candles(symbol, interval, 220),
    refetchInterval: 5_000,
    placeholderData: (previous) => previous,
  });
}
