import { describe, expect, it, vi } from 'vitest';
import { advanceSyncCursor, claimSyncCursor } from '../src/mongoose/sync-cursor.js';

describe('sync cursor leases', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const identity = { tenantId: 'tenant-1', accountId: 'account-1', resource: 'products' };
  it('claims a scoped cursor only when its lease is available', async () => {
    const findOneAndUpdate = vi.fn(async () => ({ ...identity, leaseOwner: 'worker-1' }));
    const models = { SyncCursor: { findOneAndUpdate } } as never;
    await claimSyncCursor(models, { ...identity, owner: 'worker-1', now, leaseMs: 30_000 });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ...identity, $or: expect.any(Array) }),
      {
        $set: {
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-01-01T00:00:30Z'),
        },
      },
      { new: true },
    );
  });

  it("advances and releases only the current owner's lease", async () => {
    const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
    const models = { SyncCursor: { updateOne } } as never;
    await advanceSyncCursor(models, {
      ...identity,
      owner: 'worker-1',
      cursor: 'page:2',
      updatedThrough: now,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { ...identity, leaseOwner: 'worker-1' },
      {
        $set: { cursor: 'page:2', updatedThrough: now },
        $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
      },
    );
  });

  it('rejects operator-like non-string identifiers before querying MongoDB', async () => {
    const findOneAndUpdate = vi.fn();
    const models = { SyncCursor: { findOneAndUpdate } } as never;
    await expect(
      claimSyncCursor(models, {
        ...identity,
        tenantId: { $ne: null } as never,
        owner: 'worker-1',
        now,
        leaseMs: 30_000,
      }),
    ).rejects.toThrow('plain string');
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
