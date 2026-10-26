import type { BotStatus, HaltReason } from '@goodz/core';

export const botStatusLabel: Record<BotStatus, string> = {
  idle: 'Aguardando',
  starting: 'Iniciando',
  running: 'Em execução',
  stopping: 'Parando',
  stopped: 'Parado',
  halted: 'Pausado',
  error: 'Erro',
};

export const botStatusTone: Record<
  BotStatus,
  'profit' | 'loss' | 'warn' | 'info' | 'muted' | 'acid'
> = {
  idle: 'muted',
  starting: 'info',
  running: 'profit',
  stopping: 'warn',
  stopped: 'muted',
  halted: 'warn',
  error: 'loss',
};

export const haltReasonLabel: Record<HaltReason, string> = {
  daily_target: 'Meta diária atingida',
  daily_stop: 'Stop diário atingido',
  consecutive_losses: 'Perdas consecutivas',
  max_trades: 'Limite de trades/dia',
  kill_switch: 'Kill switch',
  manual: 'Parada manual',
  error: 'Erro no motor',
  config: 'Configuração inválida',
};

export const feedLabel: Record<'synthetic' | 'mexc' | 'none', string> = {
  synthetic: 'Sintético',
  mexc: 'MEXC',
  none: 'Sem feed',
};
