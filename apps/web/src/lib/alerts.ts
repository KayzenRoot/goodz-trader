import type { BotConfig, EngineStatus } from '@goodz/core';

import { haltReasonLabel } from './labels';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Derives the operator alert center from the same status/config the dashboard
 * already has. Pure and low-cardinality so it is easy to test.
 */
export function buildOperationalAlerts(
  status: EngineStatus,
  config?: BotConfig,
  now = Date.now(),
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (config?.execution.killSwitch) {
    alerts.push({
      id: 'kill-switch',
      severity: 'critical',
      title: 'Kill switch ativo',
      detail: 'Novas entradas estão bloqueadas até um humano desativar o kill switch.',
    });
  }

  if (status.status === 'halted' || status.status === 'error') {
    alerts.push({
      id: 'halt',
      severity: 'critical',
      title: 'Bot pausado',
      detail: status.haltReason
        ? `Motivo: ${haltReasonLabel[status.haltReason] ?? status.haltReason}.`
        : (status.lastError ?? 'Verifique o terminal e a MEXC antes de reiniciar.'),
    });
  }

  if (!status.feed.connected) {
    alerts.push({
      id: 'feed-offline',
      severity: 'critical',
      title: 'Feed de mercado desconectado',
      detail: 'Entradas bloqueadas e saídas podem ficar sem preço fresco. Verifique a MEXC.',
    });
  } else if (status.feed.lastTickAt) {
    const ageSec = Math.max(0, Math.round((now - status.feed.lastTickAt) / 1_000));
    if (ageSec > 15) {
      alerts.push({
        id: 'feed-stale',
        severity: 'warning',
        title: 'Feed de mercado atrasado',
        detail: `Último tick há ${ageSec}s. Entradas bloqueadas até o feed voltar.`,
      });
    }
  }

  if (status.mode === 'live' && !status.api.connected) {
    alerts.push({
      id: 'api-offline',
      severity: 'critical',
      title: 'API privada desconectada',
      detail: 'O bot live não consegue reconciliar fills/posições. Pare e reconcilie.',
    });
  }

  if (status.position && status.lossProgress >= 80) {
    alerts.push({
      id: 'loss-progress',
      severity: 'warning',
      title: 'Próximo do stop diário',
      detail: `${status.lossProgress.toFixed(0)}% do limite de perda diário consumido.`,
    });
  }

  if (config?.daily.stopOnTarget && status.targetProgress >= 100) {
    alerts.push({
      id: 'target-hit',
      severity: 'info',
      title: 'Meta diária atingida',
      detail: 'Novas entradas permanecem bloqueadas pelo guard diário.',
    });
  }

  if (status.feed.reconnects > 0) {
    alerts.push({
      id: 'feed-reconnects',
      severity: 'info',
      title: 'Feed reconectou',
      detail: `${status.feed.reconnects} reconexão(ões) desde o início da sessão.`,
    });
  }

  if (status.demoData) {
    alerts.push({
      id: 'demo-data',
      severity: 'info',
      title: 'Dados demo presentes',
      detail: 'Trades demo estão no ledger; não use esse PnL como resultado real.',
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
