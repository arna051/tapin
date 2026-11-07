import { describe, expect, it, vi } from 'vitest';
import { loadLocations, NoActiveLocationSnapshotError } from '../src/mongoose/location-reader.js';

const query = <T>(value: T) => ({
  select: () => query(value),
  sort: () => query(value),
  lean: () => query(value),
  exec: async () => value,
});

describe('Mongoose location reader', () => {
  const bundled = [{ code: 99, title: 'Fallback', cities: [{ code: 999, title: 'City' }] }];
  it('serves the active snapshot as immutable nested data', async () => {
    const models = {
      LocationSnapshot: { findOne: vi.fn(() => query({ snapshotId: 'snapshot-1' })) },
      Province: {
        find: vi.fn(() => query([{ code: 1, title: 'Tehran' }])),
      },
      City: {
        find: vi.fn(() => query([{ provinceCode: 1, code: 10, title: 'Tehran City' }])),
      },
    } as never;
    const result = await loadLocations(models, { source: 'mongoose' });
    expect(result).toEqual([
      { code: 1, title: 'Tehran', cities: [{ code: 10, title: 'Tehran City' }] },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0]?.cities)).toBe(true);
  });

  it('uses bundled data only in explicit fallback mode', async () => {
    const models = {
      LocationSnapshot: { findOne: vi.fn(() => query(null)) },
    } as never;
    await expect(
      loadLocations(models, { source: 'mongoose-with-bundled-fallback', bundled }),
    ).resolves.toEqual(bundled);
    await expect(loadLocations(models, { source: 'mongoose', bundled })).rejects.toBeInstanceOf(
      NoActiveLocationSnapshotError,
    );
  });

  it('requires an explicit fetcher for live reads', async () => {
    await expect(loadLocations({} as never, { source: 'tapin-live' })).rejects.toThrow(
      'fetchLive is required',
    );
  });
});
