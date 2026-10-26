import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { AppShell } from './AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusDot } from '@/components/ui/status-dot';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/useTrader';

export function ProtectedShell() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="border-acid/30 bg-acid/10 grid h-12 w-12 place-items-center rounded-2xl border">
            <span className="num text-acid text-lg font-bold">G</span>
          </div>
          <div className="text-muted flex items-center gap-2 text-xs">
            <StatusDot tone="acid" pulse />
            Carregando motor...
          </div>
        </div>
      </div>
    );
  }

  if (auth.isError) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="panel w-full max-w-md p-6 text-center">
          <p className="text-loss text-sm font-semibold">API indisponível</p>
          <p className="text-muted mt-2 text-xs leading-relaxed">
            Não foi possível falar com o servidor. Verifique se a API está rodando em{' '}
            <span className="num text-ink">localhost:3001</span>.
          </p>
          <Button className="mt-4" onClick={() => void auth.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (auth.data?.required && !auth.data.authenticated) {
    return (
      <LoginScreen onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['auth'] })} />
    );
  }

  return <AppShell />;
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(password),
    onSuccess,
  });

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="panel relative w-full max-w-md overflow-hidden p-7">
        <div className="mb-7 flex items-center gap-3">
          <div className="border-acid/30 bg-acid/10 grid h-11 w-11 place-items-center rounded-2xl border">
            <span className="num text-acid text-base font-bold">G</span>
          </div>
          <div>
            <p className="text-ink text-sm font-bold tracking-[0.16em]">GOODZ</p>
            <p className="text-acid text-[9px] font-semibold tracking-[0.34em]">TRADER</p>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-ink text-lg font-semibold tracking-tight">Acesso ao dashboard</h1>
          <p className="text-muted mt-1.5 text-xs leading-relaxed">
            O dashboard controla credenciais e ordens. Digite a senha configurada em{' '}
            <span className="num text-ink">AUTH_PASSWORD</span>.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <div className="relative">
            <KeyRound className="text-dim absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha do dashboard"
              className="pl-9"
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {login.isError ? (
            <p className="text-loss text-[11px]">
              {login.error instanceof ApiError ? login.error.message : 'Falha ao entrar.'}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={login.isPending}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Entrar
          </Button>
        </form>

        <div className="border-line text-dim mt-6 flex items-center gap-2 border-t pt-4 text-[10px]">
          <ShieldCheck className="text-acid h-3.5 w-3.5" />
          Sessão HttpOnly · SameSite=Strict · rate limit no login
        </div>
      </div>
    </div>
  );
}
