import { describe, expect, it, vi } from 'vitest';
import {
  runTapinMigrations,
  tapinSchemaV1Checksum,
  type TapinMigration,
} from '../src/mongoose/migrations.js';

const query = <T>(value: T) => ({ lean: () => query(value), exec: async () => value });

describe('Mongoose schema migrations', () => {
  it('runs an idempotent migration and records its checksum', async () => {
    let metadata: { key: string; version: number; checksum: string; migratedAt: Date } | null =
      null;
    const updateOne = vi.fn(
      async (
        _filter: unknown,
        update: {
          $set: { version: number; checksum: string; migratedAt: Date };
        },
      ) => {
        metadata = { key: 'tapin', ...update.$set };
        return { matchedCount: 0, upsertedCount: 1 };
      },
    );
    const up = vi.fn(async () => undefined);
    const migration: TapinMigration = {
      version: 1,
      name: 'initial',
      checksum: tapinSchemaV1Checksum,
      up,
    };
    const models = {
      SchemaMetadata: {
        findOne: () => query(metadata),
        updateOne,
      },
    } as never;
    const first = await runTapinMigrations(models, {
      migrations: [migration],
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(first).toEqual({ key: 'tapin', version: 1, applied: [1] });
    expect(up).toHaveBeenCalledOnce();
    const second = await runTapinMigrations(models, { migrations: [migration] });
    expect(second).toEqual({ key: 'tapin', version: 1, applied: [] });
    expect(up).toHaveBeenCalledOnce();
  });

  it('fails closed on version checksum drift', async () => {
    const models = {
      SchemaMetadata: {
        findOne: () => query({ key: 'tapin', version: 1, checksum: 'different' }),
      },
    } as never;
    await expect(runTapinMigrations(models)).rejects.toThrow('checksum drift');
  });
});
