import { z } from 'zod';

const item = z.object({
  code: z.coerce.number().int().positive(),
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1)),
});
export const locationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('Tapin API'),
  fetchedAt: z.string().datetime(),
  provinces: z.array(item.extend({ cities: z.array(item).min(1) })).length(31),
});
const treeSchema = z.array(item.extend({ cities: z.array(item).min(1) })).min(1);

export function generateLocationSnapshot(input: unknown, fetchedAt: string) {
  if (!z.string().datetime().safeParse(fetchedAt).success)
    throw new TypeError('fetchedAt must be an ISO-8601 instant');
  const provinces = treeSchema
    .parse(input)
    .map((province) => ({
      ...province,
      cities: [...province.cities].sort((a, b) => a.code - b.code),
    }))
    .sort((a, b) => a.code - b.code);
  const provinceCodes = new Set<number>();
  const cityCodes = new Set<number>();
  for (const province of provinces) {
    if (provinceCodes.has(province.code))
      throw new Error(`Duplicate province code ${province.code}`);
    provinceCodes.add(province.code);
    for (const city of province.cities) {
      if (cityCodes.has(city.code)) throw new Error(`Duplicate city code ${city.code}`);
      cityCodes.add(city.code);
    }
  }
  return { schemaVersion: 1 as const, source: 'Tapin API' as const, fetchedAt, provinces };
}

export const serializeLocationSnapshot = (snapshot: ReturnType<typeof generateLocationSnapshot>) =>
  `${JSON.stringify(snapshot, null, 2)}\n`;
