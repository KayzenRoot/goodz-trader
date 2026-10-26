import { floorToStep } from './indicators';
import type { BotConfig } from './schemas';
import type { ContractSpec, MarketSnapshot, Side } from './types';

export type RiskBlockReason =
  | 'kill_switch'
  | 'daily_stop'
  | 'daily_target'
  | 'max_trades'
  | 'consecutive_losses'
  | 'cooldown'
  | 'open_position'
  | 'spread'
  | 'leverage'
  | 'min_equity'
  | 'min_size'
  | 'api_disabled'
  | 'orders_rate'
  | 'invalid_price';

export interface RiskContext {
  config: BotConfig;
  contract: ContractSpec;
  snapshot: MarketSnapshot;
  equity: number;
  availableBalance: number;
  dayPnl: number;
  dayTrades: number;
  consecutiveLosses: number;
  lastLossAt: number | null;
  ordersLastMinute: number;
  openPositions: number;
  now: number;
  mode: 'paper' | 'live';
}

export type RiskDecision =
  | {
      allowed: true;
      side: Side;
      qty: number;
      notionalUsd: number;
      marginUsd: number;
      riskUsd: number;
      stopDistance: number;
      reason: 'ok';
    }
  | { allowed: false; reason: RiskBlockReason; detail: string };

const block = (reason: RiskBlockReason, detail: string): RiskDecision => ({
  allowed: false,
  reason,
  detail,
});

export function evaluateEntry(context: RiskContext, side: Side): RiskDecision {
  const { config, contract, snapshot, now } = context;
  const { risk, daily, strategy, execution } = config;

  if (execution.killSwitch) {
    return block('kill_switch', 'Kill switch está ativo nas configurações');
  }
  if (context.mode === 'live' && !contract.apiAllowed) {
    return block('api_disabled', `A MEXC não permite API para ${contract.symbol}`);
  }
  if (context.equity < risk.minEquityUsd) {
    return block(
      'min_equity',
      `Equity ${context.equity.toFixed(2)} abaixo do mínimo ${risk.minEquityUsd}`,
    );
  }
  if (context.dayPnl <= -Math.abs(daily.lossLimitUsd)) {
    return block('daily_stop', `Stop diário atingido (${context.dayPnl.toFixed(2)} USDT)`);
  }
  if (daily.stopOnTarget && daily.profitTargetUsd > 0 && context.dayPnl >= daily.profitTargetUsd) {
    return block('daily_target', `Meta diária atingida (${context.dayPnl.toFixed(2)} USDT)`);
  }
  if (context.dayTrades >= risk.maxTradesPerDay) {
    return block('max_trades', `Limite de ${risk.maxTradesPerDay} trades/dia atingido`);
  }
  if (context.consecutiveLosses >= risk.maxConsecutiveLosses) {
    return block(
      'consecutive_losses',
      `${context.consecutiveLosses} perdas consecutivas (limite ${risk.maxConsecutiveLosses})`,
    );
  }
  if (context.lastLossAt !== null && now - context.lastLossAt < risk.cooldownAfterLossSec * 1_000) {
    const remaining = Math.ceil(
      (risk.cooldownAfterLossSec * 1_000 - (now - context.lastLossAt)) / 1_000,
    );
    return block('cooldown', `Cooldown pós-loss: ${remaining}s restantes`);
  }
  if (context.openPositions >= risk.maxOpenPositions) {
    return block('open_position', 'Já existe uma posição aberta');
  }
  if (context.ordersLastMinute >= risk.maxOrdersPerMinute) {
    return block('orders_rate', `Limite de ${risk.maxOrdersPerMinute} ordens/minuto atingido`);
  }
  if (!Number.isFinite(snapshot.mid) || snapshot.mid <= 0) {
    return block('invalid_price', 'Preço inválido no feed de mercado');
  }
  if (snapshot.spreadBps > risk.maxSpreadBps) {
    return block(
      'spread',
      `Spread ${snapshot.spreadBps.toFixed(2)} bps acima do máximo ${risk.maxSpreadBps} bps`,
    );
  }
  if (config.leverage > contract.maxLeverage) {
    return block(
      'leverage',
      `Alavancagem ${config.leverage}x acima do máximo ${contract.maxLeverage}x de ${contract.symbol}`,
    );
  }
  if (config.leverage < contract.minLeverage) {
    return block('leverage', `Alavancagem abaixo do mínimo ${contract.minLeverage}x`);
  }

  const price = side === 'long' ? snapshot.ask : snapshot.bid;
  const stopDistance = (price * strategy.stopLossBps) / 10_000;
  if (stopDistance <= 0) return block('invalid_price', 'Distância de stop inválida');

  const riskUsd = (context.equity * risk.riskPerTradePct) / 100;
  const contractValue = contract.contractSize * price;
  if (contractValue <= 0) return block('invalid_price', 'Valor de contrato inválido');

  const qtyByRisk = riskUsd / (stopDistance * contract.contractSize);
  const qtyByNotional = risk.maxNotionalUsd / contractValue;
  const maxMargin = Math.min(risk.maxMarginPerTradeUsd, context.availableBalance * 0.8);
  const qtyByMargin = (maxMargin * config.leverage) / contractValue;
  const rawQty = Math.min(qtyByRisk, qtyByNotional, qtyByMargin);

  let qty = floorToStep(rawQty, contract.volUnit);

  if (qty < contract.minVol) {
    const minNotional = contract.minVol * contractValue;
    const minRisk = contract.minVol * stopDistance * contract.contractSize;
    if (minNotional > risk.maxNotionalUsd || minRisk > riskUsd * 2) {
      return block(
        'min_size',
        `Tamanho mínimo (${contract.minVol}) excede o risco/notional permitido`,
      );
    }
    qty = contract.minVol;
  }

  if (qty > contract.maxVol) qty = floorToStep(contract.maxVol, contract.volUnit);
  if (qty < contract.minVol) return block('min_size', 'Quantidade calculada abaixo do mínimo');

  const actualNotional = qty * contractValue;
  const marginUsd = actualNotional / config.leverage;
  const actualRisk = qty * stopDistance * contract.contractSize;

  if (marginUsd > context.availableBalance * 0.95) {
    return block('min_size', 'Margem necessária acima do saldo disponível');
  }

  return {
    allowed: true,
    side,
    qty,
    notionalUsd: round(actualNotional),
    marginUsd: round(marginUsd),
    riskUsd: round(actualRisk),
    stopDistance,
    reason: 'ok',
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}
