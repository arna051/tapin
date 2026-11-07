import type { OutboxEvent, TapinModels } from './index.js';
import { assertMongoIdentifier } from './security.js';

type OutboxModels = Pick<TapinModels, 'OutboxEvent'>;
export const outboxLeaseQuery = (now: Date) => ({
  $or: [
    { state: 'pending', availableAt: { $lte: now } },
    { state: 'processing', leaseExpiresAt: { $lte: now } },
  ],
});

export async function claimOutboxEvent(
  models: OutboxModels,
  options: { owner: string; now: Date; leaseMs: number; tenantId?: string },
) {
  assertMongoIdentifier(options.owner, 'outbox lease owner');
  if (options.tenantId !== undefined) assertMongoIdentifier(options.tenantId, 'tenantId');
  if (!Number.isFinite(options.leaseMs) || options.leaseMs < 1_000 || options.leaseMs > 3_600_000)
    throw new RangeError('Outbox leaseMs must be between 1000 and 3600000');
  const leaseExpiresAt = new Date(options.now.valueOf() + options.leaseMs);
  return models.OutboxEvent.findOneAndUpdate(
    {
      ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
      ...outboxLeaseQuery(options.now),
    },
    {
      $set: { state: 'processing', leaseOwner: options.owner, leaseExpiresAt },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { availableAt: 1, _id: 1 } },
  );
}

export type OutboxWorkerOptions = Readonly<{
  owner: string;
  tenantId?: string;
  leaseMs: number;
  maxBatch: number;
  now: () => Date;
  deliver: (event: Readonly<OutboxEvent>) => Promise<void>;
  retryBackoffMs?: (attempt: number, error: unknown) => number;
  betweenDeliveriesMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
}>;

export async function runOutboxBatch(models: OutboxModels, options: OutboxWorkerOptions) {
  if (!Number.isInteger(options.maxBatch) || options.maxBatch < 1 || options.maxBatch > 100)
    throw new RangeError('Outbox maxBatch must be between 1 and 100');
  if (
    options.betweenDeliveriesMs !== undefined &&
    (!Number.isFinite(options.betweenDeliveriesMs) ||
      options.betweenDeliveriesMs < 0 ||
      options.betweenDeliveriesMs > 60_000)
  )
    throw new RangeError('Outbox betweenDeliveriesMs must be between 0 and 60000');
  const delay =
    options.delay ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < options.maxBatch; index += 1) {
    const claimed = await claimOutboxEvent(models, {
      owner: options.owner,
      now: options.now(),
      leaseMs: options.leaseMs,
      ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
    });
    if (!claimed) break;
    const event =
      'toObject' in claimed && typeof claimed.toObject === 'function'
        ? (claimed.toObject() as OutboxEvent)
        : (claimed as unknown as OutboxEvent);
    try {
      await options.deliver(event);
      await completeOutboxEvent(models, {
        tenantId: event.tenantId,
        eventId: event.eventId,
        owner: options.owner,
        deliveredAt: options.now(),
      });
      delivered += 1;
    } catch (error) {
      const backoffMs = options.retryBackoffMs?.(event.attempts, error) ?? 1_000;
      await failOutboxEvent(models, {
        tenantId: event.tenantId,
        eventId: event.eventId,
        owner: options.owner,
        now: options.now(),
        backoffMs,
      });
      failed += 1;
    }
    if (options.betweenDeliveriesMs && index + 1 < options.maxBatch)
      await delay(options.betweenDeliveriesMs);
  }
  return Object.freeze({ delivered, failed, processed: delivered + failed });
}

export async function completeOutboxEvent(
  models: OutboxModels,
  options: { tenantId: string; eventId: string; owner: string; deliveredAt: Date },
) {
  assertMongoIdentifier(options.tenantId, 'tenantId');
  assertMongoIdentifier(options.eventId, 'outbox eventId');
  assertMongoIdentifier(options.owner, 'outbox lease owner');
  const result = await models.OutboxEvent.updateOne(
    {
      tenantId: options.tenantId,
      eventId: options.eventId,
      state: 'processing',
      leaseOwner: options.owner,
    },
    {
      $set: { state: 'delivered', deliveredAt: options.deliveredAt },
      $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
    },
  );
  if (result.modifiedCount !== 1) throw new Error('Outbox lease was lost before completion');
}

export async function failOutboxEvent(
  models: OutboxModels,
  options: { tenantId: string; eventId: string; owner: string; now: Date; backoffMs: number },
) {
  assertMongoIdentifier(options.tenantId, 'tenantId');
  assertMongoIdentifier(options.eventId, 'outbox eventId');
  assertMongoIdentifier(options.owner, 'outbox lease owner');
  if (
    !Number.isFinite(options.backoffMs) ||
    options.backoffMs < 0 ||
    options.backoffMs > 86_400_000
  )
    throw new RangeError('Outbox backoffMs must be between 0 and 86400000');
  const result = await models.OutboxEvent.updateOne(
    {
      tenantId: options.tenantId,
      eventId: options.eventId,
      state: 'processing',
      leaseOwner: options.owner,
    },
    {
      $set: { state: 'pending', availableAt: new Date(options.now.valueOf() + options.backoffMs) },
      $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
    },
  );
  if (result.modifiedCount !== 1) throw new Error('Outbox lease was lost before failure handling');
}
