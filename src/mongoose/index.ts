import type { Connection, Model } from 'mongoose';
import mongoose from 'mongoose';

export type EncryptedSecret = {
  algorithm: 'aes-256-gcm';
  keyId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};
export type CredentialVault = {
  encrypt(plaintext: string): Promise<EncryptedSecret>;
  decrypt(secret: EncryptedSecret): Promise<string>;
};
export type LocationSnapshot = {
  snapshotId: string;
  source: 'tapin';
  status: 'staging' | 'active' | 'failed' | 'archived';
  fetchedAt: Date;
  activatedAt?: Date;
  provinceCount: number;
  cityCount: number;
  checksum: string;
};
export type ProvinceRecord = {
  snapshotId: string;
  code: number;
  title: string;
  normalizedTitle: string;
};
export type CityRecord = ProvinceRecord & { provinceCode: number };
export type AccountConfiguration = {
  accountId: string;
  tenantId: string;
  title: string;
  encryptedToken: EncryptedSecret;
  defaultShopId?: string;
  enabled: boolean;
};
export type ShopMapping = {
  tenantId: string;
  accountId: string;
  providerShopId: string;
  localShopId: string;
  active: boolean;
};
export type ParcelRecord = {
  tenantId: string;
  accountId: string;
  localParcelId: string;
  providerOrderId?: string;
  manualOrderId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  rawStatus?: number;
  normalizedStatus: string;
  barcode?: string;
  unknownOutcome: boolean;
  weightGrams: number;
  declaredValueIrr: string;
  postageIrr?: string;
  packagingIrr?: string;
  insuranceIrr?: string;
  codCollectionIrr?: string;
  walletDeductionIrr?: string;
};
export type ParcelEvent = {
  tenantId: string;
  localParcelId: string;
  dedupeKey: string;
  rawStatus?: number;
  normalizedStatus: string;
  occurredAt: Date;
  redactedEvidence?: Record<string, unknown>;
};
export type OperationRecord = {
  tenantId: string;
  operationId: string;
  kind: string;
  state: 'pending' | 'succeeded' | 'failed' | 'unknown';
  idempotencyKey?: string;
  requestFingerprint?: string;
  providerReference?: string;
  errorCode?: number;
  replayValue?: unknown;
};
export type TaskRecord = {
  tenantId: string;
  providerTaskId: string;
  kind: string;
  rawStatus?: number;
  normalizedStatus: string;
  terminal: boolean;
  lastPolledAt?: Date;
};
export type SyncCursor = {
  tenantId: string;
  accountId: string;
  resource: string;
  cursor?: string;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  updatedThrough?: Date;
};
export type AuditEvent = {
  tenantId: string;
  eventId: string;
  action: string;
  actor?: string;
  subjectId?: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};
export type OutboxEvent = {
  tenantId: string;
  eventId: string;
  topic: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'processing' | 'delivered' | 'failed';
  attempts: number;
  availableAt: Date;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  deliveredAt?: Date;
};
export type SchemaMetadata = { key: string; version: number; migratedAt: Date; checksum?: string };

export type TapinModels = {
  AccountConfiguration: Model<AccountConfiguration>;
  ShopMapping: Model<ShopMapping>;
  Parcel: Model<ParcelRecord>;
  ParcelEvent: Model<ParcelEvent>;
  Operation: Model<OperationRecord>;
  Task: Model<TaskRecord>;
  SyncCursor: Model<SyncCursor>;
  LocationSnapshot: Model<LocationSnapshot>;
  Province: Model<ProvinceRecord>;
  City: Model<CityRecord>;
  AuditEvent: Model<AuditEvent>;
  OutboxEvent: Model<OutboxEvent>;
  SchemaMetadata: Model<SchemaMetadata>;
};

const options = { timestamps: true, minimize: false } as const;
const encryptedSecretSchema = new mongoose.Schema<EncryptedSecret>(
  {
    algorithm: { type: String, enum: ['aes-256-gcm'], required: true },
    keyId: { type: String, required: true },
    iv: { type: String, required: true },
    ciphertext: { type: String, required: true, select: false },
    authTag: { type: String, required: true, select: false },
  },
  { _id: false },
);

export function createTapinModels(connection: Connection, prefix = 'Tapin'): TapinModels {
  const account = new mongoose.Schema<AccountConfiguration>(
    {
      accountId: { type: String, required: true },
      tenantId: { type: String, required: true },
      title: { type: String, required: true },
      encryptedToken: { type: encryptedSecretSchema, required: true, select: false },
      defaultShopId: String,
      enabled: { type: Boolean, default: false },
    },
    options,
  );
  account.index({ tenantId: 1, accountId: 1 }, { unique: true });
  const shop = new mongoose.Schema<ShopMapping>(
    {
      tenantId: { type: String, required: true },
      accountId: { type: String, required: true },
      providerShopId: { type: String, required: true },
      localShopId: { type: String, required: true },
      active: { type: Boolean, default: true },
    },
    options,
  );
  shop.index({ tenantId: 1, accountId: 1, providerShopId: 1 }, { unique: true });
  shop.index(
    { tenantId: 1, localShopId: 1 },
    { unique: true, partialFilterExpression: { active: true } },
  );
  const parcel = new mongoose.Schema<ParcelRecord>(
    {
      tenantId: { type: String, required: true },
      accountId: { type: String, required: true },
      localParcelId: { type: String, required: true },
      providerOrderId: String,
      manualOrderId: { type: String, required: true },
      idempotencyKey: { type: String, required: true },
      requestFingerprint: { type: String, required: true },
      rawStatus: Number,
      normalizedStatus: { type: String, required: true },
      barcode: String,
      unknownOutcome: { type: Boolean, default: false },
      weightGrams: { type: Number, required: true, min: 1 },
      declaredValueIrr: { type: String, required: true },
      postageIrr: String,
      packagingIrr: String,
      insuranceIrr: String,
      codCollectionIrr: String,
      walletDeductionIrr: String,
    },
    options,
  );
  parcel.index({ tenantId: 1, accountId: 1, idempotencyKey: 1 }, { unique: true });
  parcel.index({ tenantId: 1, accountId: 1, manualOrderId: 1 }, { unique: true });
  parcel.index({ tenantId: 1, accountId: 1, providerOrderId: 1 }, { unique: true, sparse: true });
  const parcelEvent = new mongoose.Schema<ParcelEvent>(
    {
      tenantId: { type: String, required: true },
      localParcelId: { type: String, required: true },
      dedupeKey: { type: String, required: true },
      rawStatus: Number,
      normalizedStatus: { type: String, required: true },
      occurredAt: { type: Date, required: true },
      redactedEvidence: mongoose.Schema.Types.Mixed,
    },
    options,
  );
  parcelEvent.index({ tenantId: 1, localParcelId: 1, dedupeKey: 1 }, { unique: true });
  parcelEvent.index({ tenantId: 1, localParcelId: 1, occurredAt: 1 });
  const operation = new mongoose.Schema<OperationRecord>(
    {
      tenantId: { type: String, required: true },
      operationId: { type: String, required: true },
      kind: { type: String, required: true },
      state: { type: String, enum: ['pending', 'succeeded', 'failed', 'unknown'], required: true },
      idempotencyKey: String,
      requestFingerprint: String,
      providerReference: String,
      errorCode: Number,
      replayValue: mongoose.Schema.Types.Mixed,
    },
    options,
  );
  operation.index({ tenantId: 1, operationId: 1 }, { unique: true });
  operation.index({ tenantId: 1, kind: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
  const task = new mongoose.Schema<TaskRecord>(
    {
      tenantId: { type: String, required: true },
      providerTaskId: { type: String, required: true },
      kind: { type: String, required: true },
      rawStatus: Number,
      normalizedStatus: { type: String, required: true },
      terminal: { type: Boolean, default: false },
      lastPolledAt: Date,
    },
    options,
  );
  task.index({ tenantId: 1, providerTaskId: 1 }, { unique: true });
  task.index({ tenantId: 1, terminal: 1, lastPolledAt: 1 });
  const sync = new mongoose.Schema<SyncCursor>(
    {
      tenantId: { type: String, required: true },
      accountId: { type: String, required: true },
      resource: { type: String, required: true },
      cursor: String,
      leaseOwner: String,
      leaseExpiresAt: Date,
      updatedThrough: Date,
    },
    options,
  );
  sync.index({ tenantId: 1, accountId: 1, resource: 1 }, { unique: true });
  sync.index({ leaseExpiresAt: 1 });
  const snapshot = new mongoose.Schema<LocationSnapshot>(
    {
      snapshotId: { type: String, required: true, unique: true },
      source: { type: String, enum: ['tapin'], default: 'tapin' },
      status: { type: String, enum: ['staging', 'active', 'failed', 'archived'], required: true },
      fetchedAt: { type: Date, required: true },
      activatedAt: Date,
      provinceCount: { type: Number, required: true },
      cityCount: { type: Number, required: true },
      checksum: { type: String, required: true },
    },
    options,
  );
  snapshot.index(
    { source: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'active' } },
  );
  const province = new mongoose.Schema<ProvinceRecord>(
    {
      snapshotId: { type: String, required: true },
      code: { type: Number, required: true },
      title: { type: String, required: true },
      normalizedTitle: { type: String, required: true },
    },
    options,
  );
  province.index({ snapshotId: 1, code: 1 }, { unique: true });
  province.index({ snapshotId: 1, normalizedTitle: 1 });
  const city = new mongoose.Schema<CityRecord>(
    {
      snapshotId: { type: String, required: true },
      provinceCode: { type: Number, required: true },
      code: { type: Number, required: true },
      title: { type: String, required: true },
      normalizedTitle: { type: String, required: true },
    },
    options,
  );
  city.index({ snapshotId: 1, code: 1 }, { unique: true });
  city.index({ snapshotId: 1, provinceCode: 1, normalizedTitle: 1 });
  const audit = new mongoose.Schema<AuditEvent>(
    {
      tenantId: { type: String, required: true },
      eventId: { type: String, required: true },
      action: { type: String, required: true },
      actor: String,
      subjectId: String,
      occurredAt: { type: Date, required: true },
      metadata: mongoose.Schema.Types.Mixed,
    },
    options,
  );
  audit.index({ tenantId: 1, eventId: 1 }, { unique: true });
  audit.index({ tenantId: 1, occurredAt: -1 });
  const outbox = new mongoose.Schema<OutboxEvent>(
    {
      tenantId: { type: String, required: true },
      eventId: { type: String, required: true },
      topic: { type: String, required: true },
      aggregateId: { type: String, required: true },
      payload: { type: mongoose.Schema.Types.Mixed, required: true },
      state: {
        type: String,
        enum: ['pending', 'processing', 'delivered', 'failed'],
        default: 'pending',
      },
      attempts: { type: Number, default: 0 },
      availableAt: { type: Date, required: true },
      leaseOwner: String,
      leaseExpiresAt: Date,
      deliveredAt: Date,
    },
    options,
  );
  outbox.index({ tenantId: 1, eventId: 1 }, { unique: true });
  outbox.index({ state: 1, availableAt: 1 });
  outbox.index({ leaseExpiresAt: 1 }, { sparse: true });
  const metadata = new mongoose.Schema<SchemaMetadata>(
    {
      key: { type: String, required: true, unique: true },
      version: { type: Number, required: true },
      migratedAt: { type: Date, required: true },
      checksum: String,
    },
    options,
  );
  const model = <T>(name: string, schema: mongoose.Schema<T>) =>
    (connection.models[name] as Model<T> | undefined) ?? connection.model<T>(name, schema);
  return {
    AccountConfiguration: model(`${prefix}AccountConfiguration`, account),
    ShopMapping: model(`${prefix}ShopMapping`, shop),
    Parcel: model(`${prefix}Parcel`, parcel),
    ParcelEvent: model(`${prefix}ParcelEvent`, parcelEvent),
    Operation: model(`${prefix}Operation`, operation),
    Task: model(`${prefix}Task`, task),
    SyncCursor: model(`${prefix}SyncCursor`, sync),
    LocationSnapshot: model(`${prefix}LocationSnapshot`, snapshot),
    Province: model(`${prefix}Province`, province),
    City: model(`${prefix}City`, city),
    AuditEvent: model(`${prefix}AuditEvent`, audit),
    OutboxEvent: model(`${prefix}OutboxEvent`, outbox),
    SchemaMetadata: model(`${prefix}SchemaMetadata`, metadata),
  };
}

export * from './encryption.js';
export * from './locations.js';
export * from './outbox.js';
export * from './idempotency.js';
export * from './location-reader.js';
export * from './sync-cursor.js';
export * from './parcel-status.js';
export * from './migrations.js';
