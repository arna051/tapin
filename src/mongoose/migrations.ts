import { createHash } from 'node:crypto';
import type { TapinModels } from './index.js';
import { assertMongoIdentifier } from './security.js';

export const TAPIN_SCHEMA_KEY = 'tapin' as const;
export const TAPIN_SCHEMA_VERSION = 1 as const;
const schemaManifest = [
  'AccountConfiguration',
  'ShopMapping',
  'Parcel',
  'ParcelEvent',
  'Operation',
  'Task',
  'SyncCursor',
  'LocationSnapshot',
  'Province',
  'City',
  'AuditEvent',
  'OutboxEvent',
  'SchemaMetadata',
] as const satisfies readonly (keyof TapinModels)[];

export type TapinMigration = Readonly<{
  version: number;
  name: string;
  checksum: string;
  /** Must be idempotent because a process can stop after up() but before its version stamp. */
  up(models: TapinModels): Promise<void>;
}>;

export const tapinSchemaV1Checksum = createHash('sha256')
  .update(JSON.stringify({ version: TAPIN_SCHEMA_VERSION, models: schemaManifest }))
  .digest('hex');

export async function ensureTapinIndexes(models: TapinModels): Promise<void> {
  for (const name of schemaManifest) await models[name].createIndexes();
}

export const tapinSchemaV1Migration: TapinMigration = Object.freeze({
  version: TAPIN_SCHEMA_VERSION,
  name: 'initialize-models-and-indexes',
  checksum: tapinSchemaV1Checksum,
  up: ensureTapinIndexes,
});

export async function runTapinMigrations(
  models: TapinModels,
  options: {
    migrations?: readonly TapinMigration[];
    key?: string;
    now?: () => Date;
  } = {},
) {
  const migrations = [...(options.migrations ?? [tapinSchemaV1Migration])].sort(
    (a, b) => a.version - b.version,
  );
  const key = options.key ?? TAPIN_SCHEMA_KEY;
  assertMongoIdentifier(key, 'schema metadata key');
  const versions = migrations.map(({ version }) => version);
  if (
    migrations.length === 0 ||
    versions.some((version, index) => !Number.isInteger(version) || version !== index + 1)
  )
    throw new Error('Tapin migrations must contain contiguous versions starting at 1');
  const metadata = await models.SchemaMetadata.findOne({ key }).lean().exec();
  let currentVersion = metadata?.version ?? 0;
  if (currentVersion > migrations.length)
    throw new Error(`Database schema version ${currentVersion} is newer than this package`);
  if (currentVersion > 0 && metadata?.checksum !== migrations[currentVersion - 1]?.checksum)
    throw new Error(`Tapin schema checksum drift detected at version ${currentVersion}`);
  const applied: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    await migration.up(models);
    const result = await models.SchemaMetadata.updateOne(
      { key, version: currentVersion },
      {
        $set: {
          version: migration.version,
          migratedAt: (options.now ?? (() => new Date()))(),
          checksum: migration.checksum,
        },
        $setOnInsert: { key },
      },
      { upsert: currentVersion === 0 },
    );
    if ((result.matchedCount ?? 0) + (result.upsertedCount ?? 0) !== 1)
      throw new Error('Tapin schema migration race detected');
    currentVersion = migration.version;
    applied.push(migration.version);
  }
  return Object.freeze({ key, version: currentVersion, applied: Object.freeze(applied) });
}
