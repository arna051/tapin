import { describe, expect, it } from 'vitest';
import { MongooseIdempotencyStore } from '../src/mongoose/idempotency.js';
import type { OperationRecord } from '../src/mongoose/index.js';

const codec = {
  encode: (value: { providerOrderId: string }) => value,
  decode: (value: unknown) => value as { providerOrderId: string },
};

const createModel = () => {
  const records: OperationRecord[] = [];
  const model = {
    findOne: (filter: Partial<OperationRecord>) => ({
      lean: () => ({
        exec: async () =>
          records.find((record) =>
            Object.entries(filter).every(
              ([key, value]) => record[key as keyof OperationRecord] === value,
            ),
          ) ?? null,
      }),
    }),
    create: async (record: OperationRecord) => {
      if (
        records.some(
          (item) =>
            item.tenantId === record.tenantId &&
            item.kind === record.kind &&
            item.idempotencyKey === record.idempotencyKey,
        )
      )
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.push(record);
    },
    updateOne: async (
      filter: Partial<OperationRecord>,
      update: { $set: Partial<OperationRecord> },
    ) => {
      const record = records.find((item) =>
        Object.entries(filter).every(
          ([key, value]) => item[key as keyof OperationRecord] === value,
        ),
      );
      if (!record) return { matchedCount: 0 };
      Object.assign(record, update.$set);
      return { matchedCount: 1 };
    },
  };
  return { model: model as never, records };
};

describe('Mongoose idempotency store', () => {
  it('acquires, replays, and detects conflicting fingerprints per tenant', async () => {
    const { model } = createModel();
    const store = new MongooseIdempotencyStore({
      model,
      tenantId: 'tenant-1',
      kind: 'parcel.create',
      newOperationId: () => 'operation-1',
      codec,
    });
    await expect(store.reserve('key-1', 'fingerprint-1')).resolves.toEqual({
      state: 'acquired',
    });
    await expect(store.reserve('key-1', 'fingerprint-1')).resolves.toEqual({
      state: 'pending',
    });
    await store.complete('key-1', 'fingerprint-1', { providerOrderId: '42' });
    await expect(store.reserve('key-1', 'fingerprint-1')).resolves.toEqual({
      state: 'replay',
      value: { providerOrderId: '42' },
    });
    await expect(store.reserve('key-1', 'different')).resolves.toEqual({ state: 'conflict' });
  });

  it('marks uncertain mutations unknown and keeps them pending reconciliation', async () => {
    const { model, records } = createModel();
    const store = new MongooseIdempotencyStore({
      model,
      tenantId: 'tenant-1',
      kind: 'parcel.create',
      newOperationId: () => 'operation-1',
      codec,
    });
    await store.reserve('key-1', 'fingerprint-1');
    await store.markUnknown('key-1', 'fingerprint-1');
    expect(records[0]?.state).toBe('unknown');
    await expect(store.reserve('key-1', 'fingerprint-1')).resolves.toEqual({
      state: 'pending',
    });
  });

  it('allows only one concurrent reservation winner', async () => {
    const { model } = createModel();
    let sequence = 0;
    const store = new MongooseIdempotencyStore({
      model,
      tenantId: 'tenant-1',
      kind: 'parcel.create',
      newOperationId: () => `operation-${++sequence}`,
      codec,
    });
    const results = await Promise.all([
      store.reserve('shared', 'same'),
      store.reserve('shared', 'same'),
    ]);
    expect(results.map((result) => result.state).sort()).toEqual(['acquired', 'pending']);
  });
});
