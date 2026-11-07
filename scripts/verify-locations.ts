import { readFile } from 'node:fs/promises';
import {
  findCities,
  findProvinces,
  getCity,
  getProvince,
  listProvinces,
} from '../src/browser/index.js';
import { locationSnapshotSchema } from './location-snapshot.js';
const path = new URL('../src/browser/data/iran-locations.json', import.meta.url);
const data = locationSnapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
const provinceCodes = new Set<number>();
const cityCodes = new Set<number>();
for (const province of data.provinces) {
  if (provinceCodes.has(province.code)) throw new Error(`Duplicate province code ${province.code}`);
  provinceCodes.add(province.code);
  for (const city of province.cities) {
    if (cityCodes.has(city.code)) throw new Error(`Duplicate city code ${city.code}`);
    cityCodes.add(city.code);
  }
}
for (const province of data.provinces) {
  if (getProvince(province.code)?.title !== province.title)
    throw new Error(`Province lookup failed for ${province.code}`);
  if (!findProvinces(province.title).some(({ code }) => code === province.code))
    throw new Error(`Province search failed for ${province.code}`);
  for (const city of province.cities) {
    if (getCity(province.code, city.code)?.title !== city.title)
      throw new Error(`City lookup failed for ${city.code}`);
    if (!findCities(city.title, province.code).some(({ code }) => code === city.code))
      throw new Error(`City search failed for ${city.code}`);
  }
}
const copy = listProvinces();
if (copy[0]) copy[0].title = '__mutated_copy__';
if (data.provinces[0] && getProvince(data.provinces[0].code)?.title === '__mutated_copy__')
  throw new Error('Location helper leaked mutable module-global data');
console.log(
  `Verified ${provinceCodes.size} provinces and ${cityCodes.size} cities (${data.fetchedAt})`,
);
