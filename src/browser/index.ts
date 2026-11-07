import raw from './data/iran-locations.json' with { type: 'json' };
import { normalizePersian } from '../text.js';
export * from '../domain.js';
export * from '../error-codes.js';
export * from '../status.js';
export * from '../money.js';
export * from '../contracts.js';
export type City = Readonly<{ code: number; title: string }>;
export type Province = Readonly<{ code: number; title: string; cities: readonly City[] }>;
export { normalizePersian } from '../text.js';
const data = raw as {
  schemaVersion: number;
  source: string;
  fetchedAt: string | null;
  provinces: Province[];
};
export const provinces: readonly Province[] = Object.freeze(
  data.provinces.map((p) =>
    Object.freeze({ ...p, cities: Object.freeze(p.cities.map((c) => Object.freeze({ ...c }))) }),
  ),
);
export const listProvinces = () =>
  provinces.map((p) => ({ ...p, cities: p.cities.map((c) => ({ ...c })) }));
export const getProvince = (code: number) => provinces.find((p) => p.code === code);
export const getCities = (provinceCode: number) => getProvince(provinceCode)?.cities ?? [];
export const getCity = (provinceCode: number, cityCode: number) =>
  getCities(provinceCode).find((c) => c.code === cityCode);
export const findProvinces = (query: string) => {
  const q = normalizePersian(query);
  return provinces.filter((p) => normalizePersian(p.title).includes(q));
};
export const findCities = (query: string, provinceCode?: number) => {
  const q = normalizePersian(query);
  const source =
    provinceCode === undefined ? provinces.flatMap((p) => p.cities) : getCities(provinceCode);
  return source.filter((c) => normalizePersian(c.title).includes(q));
};
