import type { EngineStatus } from '@goodz/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/store/live';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Falha inesperada.';
}

export function useBotActions() {
  const queryClient = useQueryClient();

  const sync = (status: EngineStatus) => {
    useLiveStore.setState({ status });
    queryClient.setQueryData(['status'], status);
    void queryClient.invalidateQueries({ queryKey: ['trades'] });
    void queryClient.invalidateQueries({ queryKey: ['metrics'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    void queryClient.invalidateQueries({ queryKey: ['logs'] });
    void queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  const start = useMutation({
    mutationFn: (confirmation?: string) => api.startBot(confirmation),
    onSuccess: (status) => {
      sync(status);
      toast.success(
        status.mode === 'live'
          ? 'Trading real iniciado. Acompanhe cada ordem.'
          : 'Bot paper iniciado.',
        {
          description: `${status.symbol} · ${status.feed.source} · ${status.feed.connected ? 'feed ok' : 'aguardando feed'}`,
        },
      );
    },
    onError: (error) =>
      toast.error('Não foi possível iniciar', { description: errorMessage(error) }),
  });

  const stop = useMutation({
    mutationFn: (closePosition: boolean) => api.stopBot(closePosition),
    onSuccess: (status) => {
      sync(status);
      toast.success('Bot parado', { description: 'Novas ordens estão bloqueadas.' });
    },
    onError: (error) => toast.error('Falha ao parar', { description: errorMessage(error) }),
  });

  const kill = useMutation({
    mutationFn: api.killBot,
    onSuccess: (status) => {
      sync(status);
      toast.warning('Kill switch acionado', {
        description: 'O bot foi pausado e a posição foi encerrada quando possível.',
      });
    },
    onError: (error) => toast.error('Falha no kill switch', { description: errorMessage(error) }),
  });

  const closePosition = useMutation({
    mutationFn: api.closePosition,
    onSuccess: (status) => {
      sync(status);
      toast.success('Posição encerrada');
    },
    onError: (error) =>
      toast.error('Falha ao fechar posição', { description: errorMessage(error) }),
  });

  return { start, stop, kill, closePosition };
}
