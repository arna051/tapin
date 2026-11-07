import { assertShipmentTransition, shipmentStateSchema, type ShipmentState } from '../domain.js';
import { normalizeTapinStatus, statusHistoryDedupeKey } from '../status.js';
import type { ParcelRecord, TapinModels } from './index.js';
import { assertMongoIdentifier } from './security.js';

type ParcelModels = Pick<TapinModels, 'Parcel' | 'ParcelEvent'>;
export type RecordParcelStatusOptions = Readonly<{
  tenantId: string;
  localParcelId: string;
  rawCode: number;
  rawLabel?: string;
  observedAt: Date;
  redactedEvidence?: Record<string, unknown>;
}>;

export class ParcelStatusRaceError extends Error {
  constructor() {
    super('Parcel status changed concurrently; reconcile and retry the local update');
    this.name = 'ParcelStatusRaceError';
  }
}

const duplicateKey = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

export function planParcelStatusUpdate(
  parcel: Pick<ParcelRecord, 'normalizedStatus'>,
  options: Pick<RecordParcelStatusOptions, 'rawCode' | 'rawLabel' | 'observedAt'>,
) {
  const previousState = shipmentStateSchema.parse(parcel.normalizedStatus);
  const normalized = normalizeTapinStatus(options.rawCode, {
    ...(options.rawLabel === undefined ? {} : { label: options.rawLabel }),
    observedAt: options.observedAt,
  });
  const nextState: ShipmentState =
    normalized.state === 'unknown' ? previousState : normalized.state;
  assertShipmentTransition(previousState, nextState);
  return Object.freeze({
    previousState,
    nextState,
    normalized,
    dedupeKey: statusHistoryDedupeKey(normalized),
  });
}

export async function recordParcelStatus(models: ParcelModels, options: RecordParcelStatusOptions) {
  assertMongoIdentifier(options.tenantId, 'tenantId');
  assertMongoIdentifier(options.localParcelId, 'localParcelId');
  if (!Number.isInteger(options.rawCode)) throw new TypeError('rawCode must be an integer');
  if (Number.isNaN(options.observedAt.valueOf())) throw new TypeError('observedAt must be valid');
  try {
    return await models.Parcel.db.transaction(async (session) => {
      const parcel = await models.Parcel.findOne({
        tenantId: options.tenantId,
        localParcelId: options.localParcelId,
      })
        .session(session)
        .lean<ParcelRecord>()
        .exec();
      if (!parcel) throw new Error('Tapin parcel was not found');
      const plan = planParcelStatusUpdate(parcel, options);
      await models.ParcelEvent.create(
        [
          {
            tenantId: options.tenantId,
            localParcelId: options.localParcelId,
            dedupeKey: plan.dedupeKey,
            rawStatus: options.rawCode,
            normalizedStatus: plan.nextState,
            occurredAt: options.observedAt,
            ...(options.redactedEvidence === undefined
              ? {}
              : { redactedEvidence: options.redactedEvidence }),
          },
        ],
        { session },
      );
      const updated = await models.Parcel.updateOne(
        {
          tenantId: options.tenantId,
          localParcelId: options.localParcelId,
          normalizedStatus: parcel.normalizedStatus,
        },
        { $set: { rawStatus: options.rawCode, normalizedStatus: plan.nextState } },
        { session },
      );
      if (updated.matchedCount !== 1) throw new ParcelStatusRaceError();
      return Object.freeze({ duplicate: false as const, ...plan });
    });
  } catch (error) {
    if (duplicateKey(error)) return Object.freeze({ duplicate: true as const });
    throw error;
  }
}
