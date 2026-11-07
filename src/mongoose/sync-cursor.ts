import type { TapinModels } from './index.js';
import { assertMongoIdentifier } from './security.js';

type SyncModels = Pick<TapinModels, 'SyncCursor'>;
export type SyncCursorIdentity = Readonly<{
  tenantId: string;
  accountId: string;
  resource: string;
}>;

const validateIdentity = (identity: SyncCursorIdentity) => {
  assertMongoIdentifier(identity.tenantId, 'tenantId');
  assertMongoIdentifier(identity.accountId, 'accountId');
  assertMongoIdentifier(identity.resource, 'resource');
};

export async function claimSyncCursor(
  models: SyncModels,
  options: SyncCursorIdentity & { owner: string; now: Date; leaseMs: number },
) {
  validateIdentity(options);
  assertMongoIdentifier(options.owner, 'sync lease owner');
  if (!Number.isFinite(options.leaseMs) || options.leaseMs < 1_000 || options.leaseMs > 3_600_000)
    throw new RangeError('Sync leaseMs must be between 1000 and 3600000');
  return models.SyncCursor.findOneAndUpdate(
    {
      tenantId: options.tenantId,
      accountId: options.accountId,
      resource: options.resource,
      $or: [
        { leaseOwner: { $exists: false } },
        { leaseExpiresAt: { $lte: options.now } },
        { leaseOwner: options.owner },
      ],
    },
    {
      $set: {
        leaseOwner: options.owner,
        leaseExpiresAt: new Date(options.now.valueOf() + options.leaseMs),
      },
    },
    { new: true },
  );
}

export async function advanceSyncCursor(
  models: SyncModels,
  options: SyncCursorIdentity & {
    owner: string;
    cursor?: string;
    updatedThrough: Date;
    release?: boolean;
  },
) {
  validateIdentity(options);
  assertMongoIdentifier(options.owner, 'sync lease owner');
  if (options.cursor !== undefined) assertMongoIdentifier(options.cursor, 'sync cursor', 2_048);
  const result = await models.SyncCursor.updateOne(
    {
      tenantId: options.tenantId,
      accountId: options.accountId,
      resource: options.resource,
      leaseOwner: options.owner,
    },
    {
      $set: {
        ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
        updatedThrough: options.updatedThrough,
      },
      ...(options.release === false ? {} : { $unset: { leaseOwner: 1, leaseExpiresAt: 1 } }),
    },
  );
  if (result.modifiedCount !== 1) throw new Error('Sync cursor lease was lost before advancing');
}
