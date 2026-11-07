import type { Model } from 'mongoose';
import type { IdempotencyReservation, IdempotencyStore } from '../node/idempotency.js';
import type { OperationRecord } from './index.js';
import { assertMongoIdentifier } from './security.js';

export type MongooseIdempotencyCodec<T> = Readonly<{
  encode(value: T): unknown;
  decode(value: unknown): T;
}>;

export type MongooseIdempotencyStoreOptions<T> = Readonly<{
  model: Model<OperationRecord>;
  tenantId: string;
  kind: string;
  newOperationId: () => string;
  codec: MongooseIdempotencyCodec<T>;
}>;

const duplicateKey = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

/** Tenant-scoped durable reservations backed by TapinOperation's unique idempotency index. */
export class MongooseIdempotencyStore<T> implements IdempotencyStore<T> {
  constructor(private readonly options: MongooseIdempotencyStoreOptions<T>) {
    if (!options.tenantId.trim()) throw new TypeError('tenantId is required');
    if (!options.kind.trim()) throw new TypeError('operation kind is required');
  }

  async reserve(key: string, fingerprint: string): Promise<IdempotencyReservation<T>> {
    assertMongoIdentifier(key, 'idempotency key');
    assertMongoIdentifier(fingerprint, 'request fingerprint');
    const existing = await this.find(key);
    if (existing) return this.classify(existing, fingerprint);
    try {
      await this.options.model.create({
        tenantId: this.options.tenantId,
        operationId: this.options.newOperationId(),
        kind: this.options.kind,
        state: 'pending',
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      });
      return { state: 'acquired' };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const winner = await this.find(key);
      if (!winner) throw error;
      return this.classify(winner, fingerprint);
    }
  }

  async complete(key: string, fingerprint: string, value: T): Promise<void> {
    assertMongoIdentifier(key, 'idempotency key');
    assertMongoIdentifier(fingerprint, 'request fingerprint');
    const result = await this.options.model.updateOne(this.identity(key, fingerprint), {
      $set: { state: 'succeeded', replayValue: this.options.codec.encode(value) },
    });
    if (result.matchedCount !== 1) throw new Error('Idempotency reservation was not found');
  }

  async markUnknown(key: string, fingerprint: string): Promise<void> {
    assertMongoIdentifier(key, 'idempotency key');
    assertMongoIdentifier(fingerprint, 'request fingerprint');
    const result = await this.options.model.updateOne(this.identity(key, fingerprint), {
      $set: { state: 'unknown' },
    });
    if (result.matchedCount !== 1) throw new Error('Idempotency reservation was not found');
  }

  private identity(key: string, fingerprint?: string) {
    return {
      tenantId: this.options.tenantId,
      kind: this.options.kind,
      idempotencyKey: key,
      ...(fingerprint === undefined ? {} : { requestFingerprint: fingerprint }),
    };
  }

  private async find(key: string): Promise<OperationRecord | null> {
    return this.options.model.findOne(this.identity(key)).lean<OperationRecord>().exec();
  }

  private classify(record: OperationRecord, fingerprint: string): IdempotencyReservation<T> {
    if (record.requestFingerprint !== fingerprint) return { state: 'conflict' };
    if (record.state === 'succeeded')
      return { state: 'replay', value: this.options.codec.decode(record.replayValue) };
    return { state: 'pending' };
  }
}
