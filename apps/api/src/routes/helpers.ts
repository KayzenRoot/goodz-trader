import type { z, ZodTypeAny } from 'zod';

import { HttpError } from '../lib/http-error';

export function parseInput<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', 'Dados inválidos.', result.error.issues);
  }
  return result.data;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
