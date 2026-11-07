import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createTapinClient } from '../src/node/index.js';
import { generateLocationSnapshot, serializeLocationSnapshot } from './location-snapshot.js';

const token = process.env.TAPIN_TOKEN;
if (!token) throw new Error('TAPIN_TOKEN is required; this script never stores credentials');
const fetchedAt = process.env.TAPIN_LOCATIONS_FETCHED_AT;
if (!fetchedAt)
  throw new Error(
    'TAPIN_LOCATIONS_FETCHED_AT must be an explicit ISO-8601 instant for deterministic generation',
  );

const client = createTapinClient({
  token,
  authorizationScheme: process.env.TAPIN_AUTH_SCHEME === 'JWT' ? 'JWT' : 'bare',
});
const response = await client.locations.tree({});
const output = generateLocationSnapshot(response.entries, fetchedAt);
const { provinces } = output;

const path = new URL('../src/browser/data/iran-locations.json', import.meta.url);
const previous = JSON.parse(await readFile(path, 'utf8')) as {
  provinces?: Array<{
    code: number;
    title: string;
    cities: Array<{ code: number; title: string }>;
  }>;
};
const before = new Map(
  (previous.provinces ?? []).flatMap((province) => [
    [`p:${province.code}`, province.title] as const,
    ...province.cities.map((city) => [`c:${city.code}`, city.title] as const),
  ]),
);
const after = new Map(
  provinces.flatMap((province) => [
    [`p:${province.code}`, province.title] as const,
    ...province.cities.map((city) => [`c:${city.code}`, city.title] as const),
  ]),
);
const added = [...after.keys()].filter((key) => !before.has(key));
const removed = [...before.keys()].filter((key) => !after.has(key));
const renamed = [...after.entries()]
  .filter(([key, title]) => before.has(key) && before.get(key) !== title)
  .map(([key, title]) => `${key}: ${before.get(key)} -> ${title}`);

const json = serializeLocationSnapshot(output);
const checksum = createHash('sha256').update(json).digest('hex');
await writeFile(path, json);
console.log(
  `Wrote ${provinces.length} provinces and ${provinces.reduce((count, province) => count + province.cities.length, 0)} cities; sha256=${checksum}`,
);
console.log(`Diff: ${added.length} added, ${removed.length} removed, ${renamed.length} renamed`);
for (const change of [
  ...added.map((key) => `+ ${key}: ${after.get(key)}`),
  ...removed.map((key) => `- ${key}: ${before.get(key)}`),
  ...renamed.map((value) => `~ ${value}`),
].slice(0, 200))
  console.log(change);
console.log('Review the generated diff and run npm run locations:verify before publishing.');
