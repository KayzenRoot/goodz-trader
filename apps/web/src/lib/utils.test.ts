import { describe, expect, it } from 'vitest';

import { clamp, cn, parseNumber } from './utils';

describe('utils', () => {
  it('merges classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-ink', undefined, null)).toBe('text-ink');
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it('parses localized numbers', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber(' 42 ')).toBe(42);
    expect(parseNumber('abc', 7)).toBe(7);
  });
});
