import { describe, expect, it } from 'vitest';
import { createTapinClient } from '../src/node/index.js';
import { createTapinShippingService } from '../src/node/shipping.js';
import { shippingQuoteInputSchema } from '../src/domain.js';
import { FakeTapinTransport, successEnvelope } from '../src/testing/index.js';

const quoteEntries = {
  send_price: 100,
  send_price_tax: 10,
  service_price: 5,
  service_price_tax: 1,
  post_service_price: 2,
  post_service_price_tax: 1,
  sms_price: 0,
  sms_price_tax: 0,
  logistic_price: 0,
  logistic_price_tax: 0,
  post_pickup_price: 0,
  post_pickup_price_tax: 0,
  tapin_pickup_price: 0,
  tapin_pickup_price_tax: 0,
  kiosk_price: 0,
  kiosk_price_tax: 0,
  total_send_price: 110,
  total_service_price: 9,
  total_price: 119,
  total_send_price_discount: 0,
  total_weight: 850,
};
const input = {
  shopId: 'shop',
  destination: {
    provinceCode: 1,
    cityCode: 1,
    postalCode: '1234567890',
    address: 'Tehran address',
  },
  receiver: { firstName: 'A', lastName: 'B', mobile: '09123456789' },
  service: 'pishtaz' as const,
  payment: 'sender_paid' as const,
  parcel: {
    productWeightGrams: 700,
    packagingWeightGrams: 150,
    boxId: 10,
    packageType: 'package' as const,
    contentType: 'fragile' as const,
    packagingCharge: { value: 0n, currency: 'IRR' as const },
    insurance: 'tapin' as const,
    products: [
      {
        title: 'Item',
        count: 1,
        unitValue: { value: 1_000n, currency: 'IRR' as const },
        weightGrams: 700,
      },
    ],
  },
};

describe('normalized shipping service', () => {
  it('maps normalized values to audited provider codes and returns IRR', async () => {
    const transport = new FakeTapinTransport({
      'order/post/check-price/': successEnvelope(quoteEntries),
    });
    const service = createTapinShippingService(createTapinClient({ token: 'secret', transport }), {
      clock: () => new Date('2026-01-01T00:00:00Z'),
    });
    const quote = await service.quote(input);
    expect(transport.calls[0]?.input).toMatchObject({
      pay_type: 1,
      order_type: 1,
      packet_type: 2,
      content_type: 2,
      package_weight: 150,
      employee_code: -1,
      products: [expect.objectContaining({ product_id: null })],
    });
    expect(quote).toMatchObject({
      quotedAt: new Date('2026-01-01T00:00:00Z'),
      total: { value: 119n, currency: 'IRR' },
      totalWeightGrams: 850,
    });
  });
  it('validates the documented total weight boundary', async () => {
    const transport = new FakeTapinTransport();
    const service = createTapinShippingService(createTapinClient({ token: 'secret', transport }));
    await expect(
      service.quote({ ...input, parcel: { ...input.parcel, productWeightGrams: 0 } }),
    ).rejects.toThrow();
  });
  it.each([
    ['envelope', 500, true],
    ['envelope', 501, false],
    ['padded_envelope', 2_000, true],
    ['padded_envelope', 2_001, false],
    ['package', 30_000, true],
    ['package', 30_001, false],
    ['package', 49, false],
  ] as const)('validates %s at %i total grams', (packageType, total, expected) => {
    const candidate = {
      ...input,
      parcel: {
        ...input.parcel,
        packageType,
        productWeightGrams: total,
        packagingWeightGrams: 0,
      },
    };
    expect(shippingQuoteInputSchema.safeParse(candidate).success).toBe(expected);
  });
  it('requires the documented 48-hour locker retention value', () => {
    const parcel = {
      ...input.parcel,
      locker: { kioskId: 1, retentionHours: 48 as const, canRotate: false },
    };
    expect(shippingQuoteInputSchema.safeParse({ ...input, parcel }).success).toBe(true);
    expect(
      shippingQuoteInputSchema.safeParse({
        ...input,
        parcel: { ...parcel, locker: { ...parcel.locker, retentionHours: 24 } },
      }).success,
    ).toBe(false);
  });
});
