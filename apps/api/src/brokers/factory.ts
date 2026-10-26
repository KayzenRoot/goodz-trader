import type { BotConfig, ContractSpec } from '@goodz/core';
import type { MexcFuturesClient } from '@goodz/mexc';

import type { Repository } from '../db/repo';
import type { AppLogger } from '../lib/logger';
import { LiveBroker } from './live';
import { PaperBroker } from './paper';
import type { Broker } from './types';

export function createBroker(input: {
  mode: 'paper' | 'live';
  config: BotConfig;
  contract: ContractSpec;
  repo: Repository;
  client: MexcFuturesClient;
  logger: AppLogger;
}): Broker {
  if (input.mode === 'live') {
    return new LiveBroker({
      client: input.client,
      contract: input.contract,
      symbol: input.config.primarySymbol,
      leverage: input.config.leverage,
      marginMode: input.config.marginMode,
      logger: input.logger.child('live-broker'),
    });
  }

  return new PaperBroker({
    repo: input.repo,
    contract: input.contract,
    startingBalance: input.config.paper.startingBalance,
    feeMaker: input.config.execution.feeMaker,
    feeTaker: input.config.execution.feeTaker,
    slippageBps: input.config.execution.slippageBps,
    logger: input.logger.child('paper-broker'),
  });
}
