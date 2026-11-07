import { describe, expect, it } from 'vitest';
import {
  generateLocationSnapshot,
  serializeLocationSnapshot,
} from '../scripts/location-snapshot.js';

describe('bundled location snapshot generation', () => {
  const fetchedAt = '2026-01-01T00:00:00.000Z';
  const tree = [
    { code: 2, title: ' گيلان ', cities: [{ code: 20, title: ' رشت ' }] },
    { code: 1, title: 'تهران', cities: [{ code: 10, title: 'تهران' }] },
  ];
  it('is deterministic for equivalent provider ordering', () => {
    const first = serializeLocationSnapshot(generateLocationSnapshot(tree, fetchedAt));
    const second = serializeLocationSnapshot(
      generateLocationSnapshot([...tree].reverse(), fetchedAt),
    );
    expect(first).toBe(second);
    expect(first).toContain('"title": "گيلان"');
  });
  it('rejects duplicate stable codes', () => {
    expect(() => generateLocationSnapshot([...tree, tree[0]], fetchedAt)).toThrow(
      'Duplicate province',
    );
  });
});
