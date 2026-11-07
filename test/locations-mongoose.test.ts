import { describe, expect, it, vi } from 'vitest';
import { activateLocationSnapshot, prepareLocationSnapshot } from '../src/mongoose/locations.js';

describe('Mongoose location snapshot preparation', () => {
  const tree = [
    { code: 2, title: 'گيلان', cities: [{ code: 20, title: 'رشت' }] },
    { code: 1, title: 'تهران', cities: [{ code: 10, title: 'تهران' }] },
  ];
  it('sorts, normalizes, counts, and checksums deterministically', () => {
    const options = { snapshotId: 'snapshot-1', fetchedAt: new Date('2026-01-01T00:00:00Z') };
    const first = prepareLocationSnapshot(tree, options);
    const second = prepareLocationSnapshot([...tree].reverse(), options);
    expect(first.snapshot).toEqual(second.snapshot);
    expect(first.provinces.map(({ code }) => code)).toEqual([1, 2]);
    expect(first.provinces[1]?.normalizedTitle).toBe('گیلان');
    expect(first.snapshot).toMatchObject({ provinceCount: 2, cityCount: 2 });
  });
  it('rejects duplicate province and globally duplicate city codes', () => {
    expect(() =>
      prepareLocationSnapshot([...tree, tree[0]], { snapshotId: 'x', fetchedAt: new Date() }),
    ).toThrow('Duplicate province');
    expect(() =>
      prepareLocationSnapshot(
        [
          { code: 1, title: 'A', cities: [{ code: 1, title: 'X' }] },
          { code: 2, title: 'B', cities: [{ code: 1, title: 'Y' }] },
        ],
        { snapshotId: 'x', fetchedAt: new Date() },
      ),
    ).toThrow('Duplicate city');
  });
  it('verifies stored relationships and checksum before activation', async () => {
    const prepared = prepareLocationSnapshot(tree, {
      snapshotId: 'snapshot-1',
      fetchedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const query = <T>(value: T) => ({
      select: () => query(value),
      sort: () => query(value),
      session: () => query(value),
      lean: () => query(value),
      exec: async () => value,
    });
    const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
    const models = {
      LocationSnapshot: {
        create: vi.fn(async () => undefined),
        db: { transaction: async (work: (session: object) => Promise<void>) => work({}) },
        updateMany: vi.fn(async () => undefined),
        updateOne,
      },
      Province: {
        insertMany: vi.fn(async () => undefined),
        find: vi.fn(() => query(prepared.provinces.map(({ code, title }) => ({ code, title })))),
      },
      City: {
        insertMany: vi.fn(async () => undefined),
        find: vi.fn(() =>
          query(
            prepared.cities.map(({ provinceCode, code, title }) => ({
              provinceCode,
              code,
              title,
            })),
          ),
        ),
      },
    } as never;
    await activateLocationSnapshot(models, prepared);
    expect(updateOne).toHaveBeenCalledWith(
      { snapshotId: 'snapshot-1', status: 'staging' },
      { $set: { status: 'active', activatedAt: expect.any(Date) } },
      { session: expect.any(Object) },
    );
  });

  it('marks a staging snapshot failed when persisted data is corrupted', async () => {
    const prepared = prepareLocationSnapshot(tree, {
      snapshotId: 'snapshot-1',
      fetchedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const query = <T>(value: T) => ({
      select: () => query(value),
      sort: () => query(value),
      session: () => query(value),
      lean: () => query(value),
      exec: async () => value,
    });
    const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
    const models = {
      LocationSnapshot: {
        create: vi.fn(async () => undefined),
        db: { transaction: async (work: (session: object) => Promise<void>) => work({}) },
        updateMany: vi.fn(async () => undefined),
        updateOne,
      },
      Province: {
        insertMany: vi.fn(async () => undefined),
        find: vi.fn(() => query(prepared.provinces.map(({ code, title }) => ({ code, title })))),
      },
      City: {
        insertMany: vi.fn(async () => undefined),
        find: vi.fn(() =>
          query(
            prepared.cities.map(({ provinceCode, code, title }, index) => ({
              provinceCode,
              code,
              title: index === 0 ? `${title}-corrupt` : title,
            })),
          ),
        ),
      },
    } as never;
    await expect(activateLocationSnapshot(models, prepared)).rejects.toThrow('checksum');
    expect(updateOne).toHaveBeenLastCalledWith(
      { snapshotId: 'snapshot-1', status: 'staging' },
      { $set: { status: 'failed' } },
    );
  });
});
