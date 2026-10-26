import { describe, expect, it } from 'vitest';

import { botStatusLabel, botStatusTone, feedLabel, haltReasonLabel } from './labels';

describe('labels', () => {
  it('covers every bot status', () => {
    const statuses = [
      'idle',
      'starting',
      'running',
      'stopping',
      'stopped',
      'halted',
      'error',
    ] as const;
    for (const status of statuses) {
      expect(botStatusLabel[status]).toBeTruthy();
      expect(botStatusTone[status]).toBeTruthy();
    }
  });

  it('covers halt reasons and feeds', () => {
    const reasons = [
      'daily_target',
      'daily_stop',
      'consecutive_losses',
      'max_trades',
      'kill_switch',
      'manual',
      'error',
      'config',
    ] as const;
    for (const reason of reasons) expect(haltReasonLabel[reason]).toBeTruthy();
    expect(feedLabel.synthetic).toBe('Sint\u00e9tico');
    expect(feedLabel.mexc).toBe('MEXC');
    expect(feedLabel.none).toBe('Sem feed');
  });
});
