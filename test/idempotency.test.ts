import { describe, expect, it, vi } from 'vitest';
import {
  executeIdempotent,
  IdempotencyConflictError,
  requestFingerprint,
} from '../src/node/idempotency.js';
import { InMemoryIdempotencyStore } from '../src/testing/index.js';

describe('idempotency', () => {
  it('produces stable fingerprints independent of object key order', () =>
    expect(requestFingerprint({ b: 2, a: 1 })).toBe(requestFingerprint({ a: 1, b: 2 })));
  it('replays a completed result without executing twice', async () => {
    const store = new InMemoryIdempotencyStore<number>();
    const operation = vi.fn(async () => 7);
    expect(await executeIdempotent(store, 'parcel-1', { weight: 1 }, operation)).toBe(7);
    expect(await executeIdempotent(store, 'parcel-1', { weight: 1 }, operation)).toBe(7);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('rejects the same key with a different request', async () => {
    const store = new InMemoryIdempotencyStore<number>();
    await executeIdempotent(store, 'parcel-1', { weight: 1 }, async () => 7);
    await expect(
      executeIdempotent(store, 'parcel-1', { weight: 2 }, async () => 8),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
  it('marks failed operations as unknown instead of reacquiring them', async () => {
    const store = new InMemoryIdempotencyStore<number>();
    await expect(
      executeIdempotent(store, 'parcel-1', {}, async () => {
        throw new Error('timeout');
      }),
    ).rejects.toThrow('timeout');
    expect(store.records.get('parcel-1')?.state).toBe('unknown');
    await expect(executeIdempotent(store, 'parcel-1', {}, async () => 1)).rejects.toThrow(
      'already pending',
    );
  });
});
