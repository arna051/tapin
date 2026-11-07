import { createHash } from 'node:crypto';
import { locationTreeEntriesSchema } from '../contracts.js';
import { normalizePersian } from '../text.js';
import type { TapinModels } from './index.js';

const checksumTree = (tree: unknown) =>
  createHash('sha256').update(JSON.stringify(tree)).digest('hex');

export type PreparedLocationSnapshot = ReturnType<typeof prepareLocationSnapshot>;
export function prepareLocationSnapshot(
  input: unknown,
  options: { snapshotId: string; fetchedAt: Date },
) {
  if (!options.snapshotId.trim()) throw new TypeError('snapshotId is required');
  if (Number.isNaN(options.fetchedAt.valueOf())) throw new TypeError('fetchedAt must be valid');
  const tree = locationTreeEntriesSchema
    .parse(input)
    .map((province) => ({
      ...province,
      cities: [...province.cities].sort((a, b) => a.code - b.code),
    }))
    .sort((a, b) => a.code - b.code);
  const provinceCodes = new Set<number>();
  const cityCodes = new Set<number>();
  const provinces = [];
  const cities = [];
  for (const province of tree) {
    if (provinceCodes.has(province.code))
      throw new Error(`Duplicate province code ${province.code}`);
    provinceCodes.add(province.code);
    provinces.push({
      snapshotId: options.snapshotId,
      code: province.code,
      title: province.title,
      normalizedTitle: normalizePersian(province.title),
    });
    for (const city of province.cities) {
      if (cityCodes.has(city.code)) throw new Error(`Duplicate city code ${city.code}`);
      cityCodes.add(city.code);
      cities.push({
        snapshotId: options.snapshotId,
        provinceCode: province.code,
        code: city.code,
        title: city.title,
        normalizedTitle: normalizePersian(city.title),
      });
    }
  }
  return {
    snapshot: {
      snapshotId: options.snapshotId,
      source: 'tapin' as const,
      status: 'staging' as const,
      fetchedAt: options.fetchedAt,
      provinceCount: provinces.length,
      cityCount: cities.length,
      checksum: checksumTree(tree),
    },
    provinces,
    cities,
  };
}

export async function activateLocationSnapshot(
  models: TapinModels,
  prepared: PreparedLocationSnapshot,
): Promise<void> {
  try {
    await models.LocationSnapshot.create(prepared.snapshot);
    await models.LocationSnapshot.db.transaction(async (session) => {
      await models.Province.insertMany(prepared.provinces, { session });
      await models.City.insertMany(prepared.cities, { session });
      const [storedProvinces, storedCities] = await Promise.all([
        models.Province.find({ snapshotId: prepared.snapshot.snapshotId })
          .select({ code: 1, title: 1, _id: 0 })
          .sort({ code: 1 })
          .session(session)
          .lean<Array<{ code: number; title: string }>>()
          .exec(),
        models.City.find({ snapshotId: prepared.snapshot.snapshotId })
          .select({ provinceCode: 1, code: 1, title: 1, _id: 0 })
          .sort({ provinceCode: 1, code: 1 })
          .session(session)
          .lean<Array<{ provinceCode: number; code: number; title: string }>>()
          .exec(),
      ]);
      if (
        storedProvinces.length !== prepared.snapshot.provinceCount ||
        storedCities.length !== prepared.snapshot.cityCount
      )
        throw new Error('Location snapshot verification failed');
      const citiesByProvince = new Map<number, Array<{ code: number; title: string }>>();
      for (const city of storedCities) {
        const collection = citiesByProvince.get(city.provinceCode) ?? [];
        collection.push({ code: city.code, title: city.title });
        citiesByProvince.set(city.provinceCode, collection);
      }
      const storedTree = storedProvinces.map((province) => ({
        code: province.code,
        title: province.title,
        cities: citiesByProvince.get(province.code) ?? [],
      }));
      const relatedCityCount = storedTree.reduce(
        (count, province) => count + province.cities.length,
        0,
      );
      if (
        relatedCityCount !== storedCities.length ||
        checksumTree(storedTree) !== prepared.snapshot.checksum
      )
        throw new Error('Location snapshot relationship or checksum verification failed');
      await models.LocationSnapshot.updateMany(
        { source: 'tapin', status: 'active' },
        { $set: { status: 'archived' } },
        { session },
      );
      const activated = await models.LocationSnapshot.updateOne(
        { snapshotId: prepared.snapshot.snapshotId, status: 'staging' },
        { $set: { status: 'active', activatedAt: new Date() } },
        { session },
      );
      if (activated.modifiedCount !== 1)
        throw new Error('Location snapshot activation race detected');
    });
  } catch (error) {
    await models.LocationSnapshot.updateOne(
      { snapshotId: prepared.snapshot.snapshotId, status: 'staging' },
      { $set: { status: 'failed' } },
    );
    throw error;
  }
}
