import { createHash } from 'node:crypto';

export class IdempotencyConflictError extends Error {
  constructor(public readonly key: string) {
    super(`Idempotency key ${key} was already used with a different request`);
    this.name = 'IdempotencyConflictError';
  }
}
export type IdempotencyReservation<T> =
  | { state: 'acquired' }
  | { state: 'replay'; value: T }
  | { state: 'conflict' }
  | { state: 'pending' };
export type IdempotencyStore<T> = {
  reserve(key: string, fingerprint: string): Promise<IdempotencyReservation<T>>;
  complete(key: string, fingerprint: string, value: T): Promise<void>;
  markUnknown(key: string, fingerprint: string): Promise<void>;
};

const canonicalize = (value: unknown): unknown => {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TypeError('Idempotency fingerprints require finite numbers');
  return value;
};

export const canonicalRequestJson = (value: unknown): string => JSON.stringify(canonicalize(value));
export const requestFingerprint = (value: unknown): string =>
  createHash('sha256').update(canonicalRequestJson(value)).digest('hex');

export async function executeIdempotent<T>(
  store: IdempotencyStore<T>,
  key: string,
  request: unknown,
  operation: () => Promise<T>,
): Promise<T> {
  if (!key.trim()) throw new TypeError('Idempotency key is required');
  const fingerprint = requestFingerprint(request);
  const reservation = await store.reserve(key, fingerprint);
  if (reservation.state === 'conflict') throw new IdempotencyConflictError(key);
  if (reservation.state === 'replay') return reservation.value;
  if (reservation.state === 'pending')
    throw new Error(`Idempotent operation ${key} is already pending`);
  try {
    const value = await operation();
    await store.complete(key, fingerprint, value);
    return value;
  } catch (error) {
    await store.markUnknown(key, fingerprint);
    throw error;
  }
}
