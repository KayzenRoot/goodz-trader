import { describe, expect, it, vi } from 'vitest';

import { createLogger, DbLogger } from '../src/lib/logger';

describe('DbLogger', () => {
  it('writes to stdout and the persistence sink', () => {
    const persist = vi.fn(() => 1);
    const logger = new DbLogger(createLogger('test', 'silent'), persist, 'unit');
    logger.debug('debug message');
    logger.info('info message', { value: 1 });
    logger.warn('warn message');
    logger.error('error message');
    expect(persist).toHaveBeenCalledTimes(4);
    expect(persist).toHaveBeenCalledWith('info', 'unit', 'info message', { value: 1 });
    expect(persist).toHaveBeenCalledWith('error', 'unit', 'error message', null);
  });

  it('supports child categories without a sink', () => {
    const parent = new DbLogger(createLogger('test', 'silent'));
    const child = parent.child('child');
    expect(() => child.info('hello')).not.toThrow();
  });

  it('never crashes when the persistence sink is closed', () => {
    const logger = new DbLogger(
      createLogger('test', 'silent'),
      () => {
        throw new Error('database connection is not open');
      },
      'unit',
    );
    expect(() => logger.error('during shutdown')).not.toThrow();
  });
});
