import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createTapinModels } from '../src/mongoose/index.js';

describe('Mongoose models', () => {
  it('creates all models on the caller connection without opening it', () => {
    const connection = mongoose.createConnection();
    const models = createTapinModels(connection, 'TestTapin');
    expect(Object.keys(models).sort()).toEqual(
      [
        'AccountConfiguration',
        'AuditEvent',
        'City',
        'LocationSnapshot',
        'Operation',
        'OutboxEvent',
        'Parcel',
        'ParcelEvent',
        'Province',
        'SchemaMetadata',
        'ShopMapping',
        'SyncCursor',
        'Task',
      ].sort(),
    );
    expect(connection.readyState).toBe(0);
    void connection.destroy();
  });

  it('defines tenant, idempotency, active-snapshot, and outbox indexes', () => {
    const connection = mongoose.createConnection();
    const models = createTapinModels(connection, 'IndexTapin');
    expect(models.Parcel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { tenantId: 1, accountId: 1, idempotencyKey: 1 },
          { unique: true, background: true },
        ],
      ]),
    );
    expect(models.LocationSnapshot.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { source: 1, status: 1 },
          expect.objectContaining({ unique: true, partialFilterExpression: { status: 'active' } }),
        ],
      ]),
    );
    expect(models.OutboxEvent.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ state: 1, availableAt: 1 }, { background: true }],
        [{ leaseExpiresAt: 1 }, { sparse: true, background: true }],
      ]),
    );
    void connection.destroy();
  });

  it('excludes encrypted credential material from queries by default', () => {
    const connection = mongoose.createConnection();
    const models = createTapinModels(connection, 'SecretTapin');
    expect(models.AccountConfiguration.schema.path('encryptedToken').options.select).toBe(false);
    expect(
      models.AccountConfiguration.schema.path('encryptedToken.ciphertext')?.options.select,
    ).toBe(false);
    void connection.destroy();
  });
});
