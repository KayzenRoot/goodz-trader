import { createHmac } from 'node:crypto';

export type QueryValue = string | number | boolean | null | undefined;

/**
 * MEXC contract API signs GET query strings in lexicographic order.
 * Null/undefined values are omitted; empty strings are preserved as `key=`.
 */
export function buildQuery(params: Record<string, QueryValue> = {}): string {
  return Object.keys(params)
    .filter((key) => params[key] !== null && params[key] !== undefined)
    .sort()
    .map((key) => {
      const value = params[key];
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
}

export function signPayload(
  apiKey: string,
  apiSecret: string,
  timestamp: string,
  paramString: string,
): string {
  return createHmac('sha256', apiSecret)
    .update(`${apiKey}${timestamp}${paramString}`)
    .digest('hex');
}

export interface AuthHeaders {
  ApiKey: string;
  'Request-Time': string;
  Signature: string;
  'Content-Type': 'application/json';
  'Recv-Window'?: string;
}

export function buildAuthHeaders(input: {
  apiKey: string;
  apiSecret: string;
  timestamp: string;
  paramString: string;
  recvWindow?: number;
}): AuthHeaders {
  const headers: AuthHeaders = {
    ApiKey: input.apiKey,
    'Request-Time': input.timestamp,
    Signature: signPayload(input.apiKey, input.apiSecret, input.timestamp, input.paramString),
    'Content-Type': 'application/json',
  };
  if (input.recvWindow) headers['Recv-Window'] = String(input.recvWindow);
  return headers;
}
