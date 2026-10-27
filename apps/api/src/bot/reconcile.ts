import type { Side } from '@goodz/core';

import type { BrokerReconciliation } from '../brokers';

export interface ReconcileState {
  position: { side: Side; qty: number } | null;
  pending: boolean;
}

export type ReconcileDecision =
  | { action: 'ok'; code: 'ok'; message: null }
  | { action: 'await_fill'; code: 'pending_fill'; message: string }
  | { action: 'halt'; code: string; message: string };

const ok: ReconcileDecision = { action: 'ok', code: 'ok', message: null };
const halt = (code: string, message: string): ReconcileDecision => ({
  action: 'halt',
  code,
  message,
});

/**
 * Pure decision for the state after a private-WS reconnect. REST is the source
 * of truth; a divergence must halt rather than silently continue with a
 * leveraged position. A pending entry may legitimately appear as a new
 * position before the engine polls the fill, so that case is deferred one tick.
 */
export function evaluateReconciliation(
  state: ReconcileState,
  reconciliation: BrokerReconciliation,
): ReconcileDecision {
  const positions = reconciliation.positions ?? [];
  const orders = reconciliation.orders ?? [];

  if (!state.position) {
    if (positions.length > 1) {
      return halt('multiple_positions', `Múltiplas posições na exchange (${positions.length}).`);
    }
    if (positions.length === 1) {
      if (state.pending) {
        if (orders.length > 0) {
          return halt(
            'pending_position_order_conflict',
            'Posição e ordem pendente apareceram juntas na exchange.',
          );
        }
        return {
          action: 'await_fill',
          code: 'pending_fill',
          message: 'Posição detectada enquanto o fill pendente ainda não foi confirmado.',
        };
      }
      return halt(
        'orphan_position',
        'Posição órfã na exchange: feche manualmente e revise o ledger antes de reiniciar.',
      );
    }
    if (state.pending) {
      if (orders.length > 1) {
        return halt('duplicate_orders', `Ordens duplicadas para o mesmo trade (${orders.length}).`);
      }
      return {
        action: 'await_fill',
        code: 'pending_fill',
        message: 'Ordem pendente ainda não confirmada; aguardando o próximo tick.',
      };
    }
    if (orders.length > 0) {
      return halt('orphan_orders', `Ordens órfãs na exchange (${orders.length}).`);
    }
    return ok;
  }

  if (positions.length !== 1) {
    return halt(
      'position_mismatch',
      `Ledger tem posição ${state.position.side} mas a exchange reporta ${positions.length} posição(ões).`,
    );
  }

  const exchangePosition = positions[0];
  if (exchangePosition?.side !== state.position.side) {
    return halt(
      'position_side_mismatch',
      `Lado divergente: exchange=${exchangePosition?.side}, ledger=${state.position.side}.`,
    );
  }
  if (Math.abs(exchangePosition.qty - state.position.qty) > 0.000001) {
    return halt(
      'position_qty_mismatch',
      `Quantidade divergente: exchange=${exchangePosition.qty}, ledger=${state.position.qty}.`,
    );
  }
  if (orders.length > 0) {
    return halt('orphan_orders', `Ordens abertas com posição ativa (${orders.length}).`);
  }
  return ok;
}
