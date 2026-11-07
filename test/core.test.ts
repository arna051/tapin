import { describe, expect, it } from 'vitest';
import {
  diagnoseTapinError,
  endpointCapabilities,
  endpointPaths,
  orderRegisterCapability,
  registrationConsequences,
  tapinEnvelopeSchema,
  TapinError,
  TapinNotSentError,
  TapinUnknownOutcomeError,
} from '../src/core.js';
import { normalizePersian } from '../src/browser/index.js';
import {
  assertShipmentTransition,
  canTransitionShipment,
  quoteInputSchema,
  tapinCodes,
} from '../src/domain.js';
import {
  describeTapinCode,
  tapinPlatformMessages,
  tapinPostalMessages,
} from '../src/error-codes.js';
describe('contracts', () => {
  it('parses the documented response envelope', () =>
    expect(
      tapinEnvelopeSchema.parse({ returns: { status: 200, message: 'ok' }, entries: [] }).returns
        .status,
    ).toBe(200));
  it('normalizes Persian text', () => expect(normalizePersian('  علي‌ كاظمي  ')).toBe('علی کاظمی'));
  it('marks committing registration modes', () => {
    expect(registrationConsequences.review.commitsFunds).toBe(false);
    expect(registrationConsequences.send_ready.commitsFunds).toBe(true);
  });
  it('classifies every endpoint explicitly', () => {
    for (const group of Object.keys(endpointPaths) as Array<keyof typeof endpointPaths>) {
      expect(Object.keys(endpointCapabilities[group]).sort()).toEqual(
        Object.keys(endpointPaths[group]).sort(),
      );
    }
  });
  it('centralizes provider codes and registration safety', () => {
    expect(tapinCodes.registrationMode.review).toBe(0);
    expect(tapinCodes.registrationMode.send_ready).toBe(2);
    expect(orderRegisterCapability('review')).toMatchObject({
      mutates: true,
      financial: false,
      irreversible: false,
    });
    expect(orderRegisterCapability('send_ready')).toMatchObject({
      mutates: true,
      financial: true,
      irreversible: true,
    });
  });
  it('treats status mutations as financially consequential', () => {
    expect(endpointCapabilities.orders.changeStatus).toMatchObject({
      mutates: true,
      financial: true,
      irreversible: true,
    });
    expect(endpointCapabilities.orders.changeStatusBulk).toMatchObject({
      mutates: true,
      financial: true,
      irreversible: true,
    });
  });
  it('validates integer IRR and gram units', () => {
    const parsed = quoteInputSchema.parse({
      origin: { provinceCode: 1, cityCode: 1 },
      destination: { provinceCode: 8, cityCode: 101, postalCode: '1234567890' },
      parcel: {
        productWeightGrams: 700,
        packagingWeightGrams: 150,
        packageType: 'package',
        contentType: 'fragile',
        declaredValue: { value: 10_000_000n, currency: 'IRR' },
      },
    });
    expect(parsed.parcel.declaredValue.value).toBe(10_000_000n);
  });
  it('rejects illegal terminal-state transitions', () => {
    expect(canTransitionShipment('in_transit', 'delivered')).toBe(true);
    expect(() => assertShipmentTransition('delivered', 'in_transit')).toThrow('Illegal');
  });
  it('preserves the documented platform and postal error catalogues', () => {
    expect(Object.keys(tapinPlatformMessages)).toHaveLength(73);
    expect(Object.keys(tapinPostalMessages)).toHaveLength(28);
    expect(describeTapinCode(318, 'platform')).toContain('اعتبار');
    expect(describeTapinCode(805, 'postal')).toContain('وزن');
  });
  it('produces redacted access and retry diagnostics', () => {
    const access = diagnoseTapinError(
      new TapinError('denied token-value', 403, {
        httpStatus: 403,
        authorization: 'secret',
      }),
    );
    expect(access).toMatchObject({
      category: 'access_or_ip_restriction',
      retrySafe: false,
      httpStatus: 403,
    });
    expect(JSON.stringify(access)).not.toContain('secret');
    expect(diagnoseTapinError(new TapinNotSentError('local')).retrySafe).toBe(true);
    expect(diagnoseTapinError(new TapinUnknownOutcomeError('timeout'))).toMatchObject({
      category: 'unknown_outcome',
      retrySafe: false,
    });
  });
});
