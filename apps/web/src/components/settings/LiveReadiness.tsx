import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { LiveReadiness as LiveReadinessData } from '@/lib/types';

function CheckRow({ ok, label, value }: { ok: boolean; label: string; value?: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted flex items-center gap-2 text-[11px]">
        <Icon className={ok ? 'text-profit h-3.5 w-3.5' : 'text-loss h-3.5 w-3.5'} aria-hidden />
        {label}
      </span>
      {value ? <span className="num text-ink text-[11px]">{value}</span> : null}
    </div>
  );
}

export function LiveReadiness({ data, loading }: { data?: LiveReadinessData; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="text-dim flex items-center gap-2 text-[11px]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Verificando pré-requisitos live...
      </div>
    );
  }
  if (!data) return null;

  const checks = data.checks;
  return (
    <div
      className="border-line bg-panel-2/50 mt-4 rounded-xl border p-3"
      data-testid="live-readiness"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label">Checklist live (somente leitura)</p>
        <Badge variant={data.ready ? 'profit' : 'loss'} dot>
          {data.ready ? 'pronto' : 'bloqueado'}
        </Badge>
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <CheckRow ok={checks.credentials} label="Credenciais configuradas" />
        <CheckRow ok={checks.serverFlag} label="Flag LIVE_TRADING_ENABLED" />
        <CheckRow
          ok={checks.oneWay}
          label="Conta one-way"
          value={checks.positionMode === null ? '—' : `mode ${checks.positionMode}`}
        />
        <CheckRow
          ok={checks.equityOk}
          label="Equity mínimo"
          value={`${checks.equityUsd.toFixed(2)} / ${checks.minEquityUsd} USDT`}
        />
        <CheckRow
          ok={checks.flat}
          label="Exchange flat"
          value={`${checks.openPositions} pos / ${checks.openOrders} ordens`}
        />
        <CheckRow
          ok={checks.ledgerFlat}
          label="Ledger sem trade aberto"
          value={`${checks.openLedgerTrades} aberto(s)`}
        />
        <CheckRow ok={!checks.killSwitch} label="Kill switch desativado" />
      </div>
      {data.blockers.length > 0 ? (
        <ul className="border-loss/20 bg-loss/5 text-loss mt-2 space-y-1 rounded-lg border p-2 text-[10px]">
          {data.blockers.map((blocker) => (
            <li key={blocker}>• {blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="text-profit mt-2 text-[10px]">
          Todos os gates verdes. O start live ainda exige a frase de confirmação.
        </p>
      )}
    </div>
  );
}
