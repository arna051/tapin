import { listProvinces, type Province } from '../browser/index.js';
import type { TapinModels } from './index.js';

export type LocationSource =
  'bundled' | 'mongoose' | 'mongoose-with-bundled-fallback' | 'tapin-live';

type LocationModels = Pick<TapinModels, 'LocationSnapshot' | 'Province' | 'City'>;
export type LoadLocationsOptions = Readonly<{
  source?: LocationSource;
  bundled?: readonly Province[];
  fetchLive?: () => Promise<readonly Province[]>;
}>;

export class NoActiveLocationSnapshotError extends Error {
  constructor() {
    super('No active Tapin location snapshot is available');
    this.name = 'NoActiveLocationSnapshotError';
  }
}

const copyLocations = (provinces: readonly Province[]): readonly Province[] =>
  Object.freeze(
    provinces.map((province) =>
      Object.freeze({
        code: province.code,
        title: province.title,
        cities: Object.freeze(
          province.cities.map((city) => Object.freeze({ code: city.code, title: city.title })),
        ),
      }),
    ),
  );

export async function loadLocations(
  models: LocationModels,
  options: LoadLocationsOptions = {},
): Promise<readonly Province[]> {
  const source = options.source ?? 'mongoose-with-bundled-fallback';
  const bundled = options.bundled ?? listProvinces();
  if (source === 'bundled') return copyLocations(bundled);
  if (source === 'tapin-live') {
    if (!options.fetchLive) throw new TypeError('fetchLive is required for tapin-live locations');
    return copyLocations(await options.fetchLive());
  }
  const snapshot = await models.LocationSnapshot.findOne({ source: 'tapin', status: 'active' })
    .select({ snapshotId: 1, _id: 0 })
    .lean<{ snapshotId: string }>()
    .exec();
  if (!snapshot) {
    if (source === 'mongoose-with-bundled-fallback') return copyLocations(bundled);
    throw new NoActiveLocationSnapshotError();
  }
  const [provinces, cities] = await Promise.all([
    models.Province.find({ snapshotId: snapshot.snapshotId })
      .sort({ code: 1 })
      .lean<Array<{ code: number; title: string }>>()
      .exec(),
    models.City.find({ snapshotId: snapshot.snapshotId })
      .sort({ provinceCode: 1, code: 1 })
      .lean<Array<{ provinceCode: number; code: number; title: string }>>()
      .exec(),
  ]);
  const citiesByProvince = new Map<number, Array<{ code: number; title: string }>>();
  for (const city of cities) {
    const collection = citiesByProvince.get(city.provinceCode) ?? [];
    collection.push({ code: city.code, title: city.title });
    citiesByProvince.set(city.provinceCode, collection);
  }
  return copyLocations(
    provinces.map((province) => ({
      code: province.code,
      title: province.title,
      cities: citiesByProvince.get(province.code) ?? [],
    })),
  );
}
