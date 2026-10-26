import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  decryptJson,
  encryptJson,
  maskSecret,
  randomId,
  signSession,
  verifySession,
} from '../src/lib/crypto';

const secret = 'secret-0123456789-0123456789-0123456789';

describe('crypto helpers', () => {
  it('encrypts and decrypts JSON with AES-GCM', () => {
    const payload = { apiKey: 'key', apiSecret: 'secret' };
    const encrypted = encryptJson(payload, secret);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain('apiSecret');
    expect(decryptJson(encrypted, secret)).toEqual(payload);
    expect(decryptJson(encrypted, 'wrong-secret')).toBeNull();
    expect(decryptJson('', secret)).toBeNull();
    expect(decryptJson('garbage', secret)).toBeNull();
  });

  it('masks secrets', () => {
    expect(maskSecret(undefined)).toBe('');
    expect(maskSecret('12345678')).toBe('••••••••');
    expect(maskSecret('mx-key-1234567890')).toBe('mx-k••••7890');
  });

  it('compares strings in constant time semantics', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });

  it('signs and verifies sessions', () => {
    const token = signSession({ exp: Date.now() + 60_000, nonce: 'abc' }, secret);
    expect(verifySession(token, secret)).toMatchObject({ nonce: 'abc' });
    expect(verifySession(token, secret, Date.now() + 120_000)).toBeNull();
    expect(verifySession(`${token}x`, secret)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
    expect(verifySession('bad', secret)).toBeNull();
  });

  it('creates prefixed random ids', () => {
    const first = randomId('trd');
    const second = randomId('trd');
    expect(first).toMatch(/^trd_[a-f0-9]{16}$/);
    expect(first).not.toBe(second);
  });
});
