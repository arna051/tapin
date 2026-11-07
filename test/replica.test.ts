import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateLocationSnapshot,
  claimOutboxEvent,
  completeOutboxEvent,
  createTapinModels,
  loadLocations,
  MongooseIdempotencyStore,
  prepareLocationSnapshot,
  recordParcelStatus,
  runTapinMigrations,
  type TapinModels,
} from '../src/mongoose/index.js';

const uri = process.env.TAPIN_TEST_MONGODB_URI;
const replica = uri ? describe : describe.skip;

replica('real MongoDB replica-set integration', () => {
  let connection: mongoose.Connection;
  let models: TapinModels;

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(uri!, { dbName: `tapin_test_${Date.now()}` })
      .asPromise();
    models = createTapinModels(connection, 'ReplicaTapin');
    await runTapinMigrations(models);
  }, 30_000);

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it('atomically replaces the active location snapshot', async () => {
    const first = prepareLocationSnapshot(
      [{ code: 1, title: 'تهران', cities: [{ code: 1, title: 'تهران' }] }],
      { snapshotId: 'snapshot-1', fetchedAt: new Date('2026-01-01T00:00:00Z') },
    );
    const second = prepareLocationSnapshot(
      [{ code: 2, title: 'گیلان', cities: [{ code: 20, title: 'رشت' }] }],
      { snapshotId: 'snapshot-2', fetchedAt: new Date('2026-01-02T00:00:00Z') },
    );
    await activateLocationSnapshot(models, first);
    await activateLocationSnapshot(models, second);
    expect(await models.LocationSnapshot.countDocuments({ status: 'active' })).toBe(1);
    expect(
      await models.LocationSnapshot.findOne({ snapshotId: 'snapshot-1' }).lean(),
    ).toMatchObject({ status: 'archived' });
    await expect(loadLocations(models, { source: 'mongoose' })).resolves.toEqual([
      { code: 2, title: 'گیلان', cities: [{ code: 20, title: 'رشت' }] },
    ]);
  });

  it('allows only one worker to claim an outbox event and fences completion by tenant', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    await models.OutboxEvent.create({
      tenantId: 'tenant-1',
      eventId: 'event-1',
      topic: 'parcel.changed',
      aggregateId: 'parcel-1',
      payload: { localParcelId: 'parcel-1' },
      state: 'pending',
      attempts: 0,
      availableAt: now,
    });
    const claims = await Promise.all([
      claimOutboxEvent(models, {
        tenantId: 'tenant-1',
        owner: 'worker-1',
        now,
        leaseMs: 30_000,
      }),
      claimOutboxEvent(models, {
        tenantId: 'tenant-1',
        owner: 'worker-2',
        now,
        leaseMs: 30_000,
      }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = claims.find(Boolean)!;
    await expect(
      completeOutboxEvent(models, {
        tenantId: 'another-tenant',
        eventId: 'event-1',
        owner: winner.leaseOwner!,
        deliveredAt: now,
      }),
    ).rejects.toThrow('lease was lost');
    await completeOutboxEvent(models, {
      tenantId: 'tenant-1',
      eventId: 'event-1',
      owner: winner.leaseOwner!,
      deliveredAt: now,
    });
  });

  it('records parcel status and history in one transaction', async () => {
    await models.Parcel.create({
      tenantId: 'tenant-1',
      accountId: 'account-1',
      localParcelId: 'parcel-1',
      manualOrderId: 'manual-1',
      idempotencyKey: 'key-1',
      requestFingerprint: 'fingerprint-1',
      normalizedStatus: 'in_transit',
      unknownOutcome: false,
      weightGrams: 500,
      declaredValueIrr: '100000',
    });
    await recordParcelStatus(models, {
      tenantId: 'tenant-1',
      localParcelId: 'parcel-1',
      rawCode: 7,
      observedAt: new Date('2026-01-02T00:00:00Z'),
    });
    expect(await models.Parcel.findOne({ localParcelId: 'parcel-1' }).lean()).toMatchObject({
      normalizedStatus: 'delivered',
      rawStatus: 7,
    });
    expect(await models.ParcelEvent.countDocuments({ localParcelId: 'parcel-1' })).toBe(1);
  });

  it('enforces concurrent idempotency within a tenant while isolating other tenants', async () => {
    let sequence = 0;
    const createStore = (tenantId: string) =>
      new MongooseIdempotencyStore({
        model: models.Operation,
        tenantId,
        kind: 'parcel.create',
        newOperationId: () => `${tenantId}-${++sequence}`,
        codec: {
          encode: (value: string) => value,
          decode: (value: unknown) => String(value),
        },
      });
    const firstTenant = createStore('tenant-idempotency-1');
    const results = await Promise.all([
      firstTenant.reserve('shared-key', 'same-fingerprint'),
      firstTenant.reserve('shared-key', 'same-fingerprint'),
    ]);
    expect(results.map(({ state }) => state).sort()).toEqual(['acquired', 'pending']);
    await expect(
      createStore('tenant-idempotency-2').reserve('shared-key', 'same-fingerprint'),
    ).resolves.toEqual({ state: 'acquired' });
  });

  it('allows the same local identifiers in separate account and tenant scopes', async () => {
    const parcel = {
      localParcelId: 'shared-local-parcel',
      manualOrderId: 'shared-manual-id',
      idempotencyKey: 'shared-parcel-key',
      requestFingerprint: 'shared-fingerprint',
      normalizedStatus: 'review',
      unknownOutcome: false,
      weightGrams: 500,
      declaredValueIrr: '100000',
    };
    await models.Parcel.create([
      { ...parcel, tenantId: 'isolation-tenant', accountId: 'account-1' },
      { ...parcel, tenantId: 'isolation-tenant', accountId: 'account-2' },
      { ...parcel, tenantId: 'isolation-tenant-2', accountId: 'account-1' },
    ]);
    expect(await models.Parcel.countDocuments({ localParcelId: parcel.localParcelId })).toBe(3);
  });
});
