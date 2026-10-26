import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { LiveEvent } from '@/lib/types';
import { useLiveStore } from '@/store/live';

export function useLiveSocket(): void {
  const queryClient = useQueryClient();
  const applyEvent = useLiveStore((state) => state.applyEvent);
  const setConnected = useLiveStore((state) => state.setConnected);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.addEventListener('open', () => {
        attempts = 0;
        setConnected(true);
        void queryClient.invalidateQueries();
      });

      socket.addEventListener('message', (message) => {
        try {
          const event = JSON.parse(message.data as string) as LiveEvent;
          if (!event || typeof event !== 'object' || !('type' in event)) return;
          applyEvent(event);
          if (event.type === 'trade') {
            void queryClient.invalidateQueries({ queryKey: ['trades'] });
            void queryClient.invalidateQueries({ queryKey: ['metrics'] });
            void queryClient.invalidateQueries({ queryKey: ['analytics'] });
            void queryClient.invalidateQueries({ queryKey: ['logs'] });
          }
          if (event.type === 'status') {
            void queryClient.invalidateQueries({ queryKey: ['status'] });
          }
          if (event.type === 'config') {
            void queryClient.invalidateQueries({ queryKey: ['settings'] });
          }
        } catch {
          // Ignore malformed frames.
        }
      });

      socket.addEventListener('close', (event) => {
        setConnected(false);
        if (closed) return;
        if (event.code === 1008) {
          window.dispatchEvent(new Event('goodz:unauthorized'));
          return;
        }
        attempts += 1;
        const delay = Math.min(10_000, 1_000 * 2 ** Math.min(attempts, 4));
        retry = setTimeout(connect, delay);
      });

      socket.addEventListener('error', () => {
        setConnected(false);
      });
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [applyEvent, queryClient, setConnected]);
}
