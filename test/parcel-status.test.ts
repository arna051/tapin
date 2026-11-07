import { describe, expect, it, vi } from 'vitest';
import { planParcelStatusUpdate, recordParcelStatus } from '../src/mongoose/parcel-status.js';

describe('parcel status persistence', () => {
  const observedAt = new Date('2026-01-01T00:00:00Z');
  it('preserves delivery state for financial and unknown provider statuses', () => {
    expect(
      planParcelStatusUpdate({ normalizedStatus: 'delivered' }, { rawCode: 71, observedAt }),
    ).toMatchObject({ previousState: 'delivered', nextState: 'delivered' });
    expect(
      planParcelStatusUpdate({ normalizedStatus: 'in_transit' }, { rawCode: 9999, observedAt }),
    ).toMatchObject({ previousState: 'in_transit', nextState: 'in_transit' });
  });

  it('rejects illegal delivery regressions', () => {
    expect(() =>
      planParcelStatusUpdate({ normalizedStatus: 'delivered' }, { rawCode: 5, observedAt }),
    ).toThrow('Illegal Tapin shipment transition');
  });

  it('writes an event and parcel update in one transaction', async () => {
    const create = vi.fn(async () => undefined);
    const updateOne = vi.fn(async () => ({ matchedCount: 1 }));
    const transaction = vi.fn(async (work: (session: object) => Promise<unknown>) => work({}));
    const models = {
      Parcel: {
        db: { transaction },
        findOne: () => ({
          session: () => ({
            lean: () => ({
              exec: async () => ({ normalizedStatus: 'in_transit' }),
            }),
          }),
        }),
        updateOne,
      },
      ParcelEvent: { create },
    } as never;
    const result = await recordParcelStatus(models, {
      tenantId: 'tenant-1',
      localParcelId: 'parcel-1',
      rawCode: 7,
      observedAt,
    });
    expect(result).toMatchObject({ duplicate: false, nextState: 'delivered' });
    expect(create).toHaveBeenCalledOnce();
    expect(updateOne).toHaveBeenCalledOnce();
  });
});
