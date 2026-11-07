import { describe, expect, it, vi } from 'vitest';
import {
  claimOutboxEvent,
  completeOutboxEvent,
  failOutboxEvent,
  outboxLeaseQuery,
  runOutboxBatch,
} from '../src/mongoose/outbox.js';

describe('outbox leases', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('reclaims available pending work and expired processing leases', () => {
    expect(outboxLeaseQuery(now)).toEqual({
      $or: [
        { state: 'pending', availableAt: { $lte: now } },
        { state: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    });
  });
  it('claims one event with a bounded fenced lease', async () => {
    const findOneAndUpdate = vi.fn(async () => ({ eventId: 'event-1' }));
    const models = { OutboxEvent: { findOneAndUpdate } } as never;
    await claimOutboxEvent(models, { owner: 'worker-1', now, leaseMs: 30_000 });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      outboxLeaseQuery(now),
      {
        $set: {
          state: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-01-01T00:00:30Z'),
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { availableAt: 1, _id: 1 } },
    );
  });
  it('completes and retries only while holding the lease', async () => {
    const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
    const models = { OutboxEvent: { updateOne } } as never;
    await completeOutboxEvent(models, {
      tenantId: 'tenant-1',
      eventId: 'event-1',
      owner: 'worker-1',
      deliveredAt: now,
    });
    await failOutboxEvent(models, {
      tenantId: 'tenant-1',
      eventId: 'event-2',
      owner: 'worker-1',
      now,
      backoffMs: 5_000,
    });
    expect(updateOne).toHaveBeenNthCalledWith(
      1,
      { tenantId: 'tenant-1', eventId: 'event-1', state: 'processing', leaseOwner: 'worker-1' },
      {
        $set: { state: 'delivered', deliveredAt: now },
        $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
      },
    );
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      { tenantId: 'tenant-1', eventId: 'event-2', state: 'processing', leaseOwner: 'worker-1' },
      {
        $set: { state: 'pending', availableAt: new Date('2026-01-01T00:00:05Z') },
        $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
      },
    );
  });
  it('detects lease loss', async () => {
    const models = {
      OutboxEvent: { updateOne: vi.fn(async () => ({ modifiedCount: 0 })) },
    } as never;
    await expect(
      completeOutboxEvent(models, {
        tenantId: 'tenant-1',
        eventId: 'event-1',
        owner: 'stale',
        deliveredAt: now,
      }),
    ).rejects.toThrow('lease was lost');
  });
  it('drains a bounded batch and retries failed delivery', async () => {
    const events = [
      { tenantId: 'tenant-1', eventId: 'event-1', attempts: 1 },
      { tenantId: 'tenant-1', eventId: 'event-2', attempts: 2 },
      null,
    ];
    const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
    const models = {
      OutboxEvent: {
        findOneAndUpdate: vi.fn(async () => events.shift()),
        updateOne,
      },
    } as never;
    const result = await runOutboxBatch(models, {
      owner: 'worker-1',
      leaseMs: 30_000,
      maxBatch: 10,
      now: () => now,
      deliver: async (event) => {
        if (event.eventId === 'event-2') throw new Error('temporary');
      },
      retryBackoffMs: (attempt) => attempt * 1_000,
    });
    expect(result).toEqual({ delivered: 1, failed: 1, processed: 2 });
    expect(updateOne).toHaveBeenCalledTimes(2);
  });
});
