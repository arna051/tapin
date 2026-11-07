import { describe, expect, it } from 'vitest';
import { canTransitionShipment } from '../src/domain.js';
import {
  normalizeTapinStatus,
  statusHistoryDedupeKey,
  tapinStatusDefinitions,
} from '../src/status.js';

describe('Tapin status normalization', () => {
  it('has unique definitions for every documented status', () => {
    const codes = tapinStatusDefinitions.map(({ code }) => code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(34);
  });
  it('preserves raw codes and separates financial semantics', () => {
    expect(normalizeTapinStatus(7)).toMatchObject({
      state: 'delivered',
      rawCode: 7,
      operationalKind: 'delivery',
    });
    expect(normalizeTapinStatus(71)).toMatchObject({
      state: 'unknown',
      rawCode: 71,
      operationalKind: 'financial',
    });
  });
  it('preserves unknown provider values', () =>
    expect(normalizeTapinStatus(9999, { label: 'new' })).toEqual({
      state: 'unknown',
      rawCode: 9999,
      rawLabel: 'new',
    }));
  it('allows providers to skip intermediate tracking events', () =>
    expect(canTransitionShipment('in_transit', 'delivered')).toBe(true));
  it('creates stable history dedupe keys', () =>
    expect(
      statusHistoryDedupeKey({ rawCode: 7, observedAt: new Date('2026-01-01T00:00:00Z') }),
    ).toBe('7:2026-01-01T00:00:00.000Z'));
});
