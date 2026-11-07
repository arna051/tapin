import { describe, expect, it } from 'vitest';
import {
  createPaymentRequestSchema,
  endpointContracts,
  locationTreeResponseSchema,
  orderEditRequestSchema,
  orderRegistrationResponseSchema,
  quoteResponseSchema,
  statusListResponseSchema,
} from '../src/contracts.js';
import { endpointPaths } from '../src/core.js';

const returns = { status: 200, message: 'ok' };
describe('provider contracts', () => {
  it('declares contract fidelity for every documented endpoint', () => {
    const paths = Object.values(endpointPaths)
      .flatMap((group) => Object.values(group))
      .sort();
    expect(Object.keys(endpointContracts).sort()).toEqual(paths);
    for (const contract of Object.values(endpointContracts)) {
      expect(contract.request).toBeDefined();
      expect(['audited', 'envelope', 'content-type-and-stream']).toContain(contract.fidelity);
      if (contract.kind === 'json') expect(contract.fidelity).toBe('audited');
    }
  });
  it('parses the documented registration response while preserving extra fields', () => {
    const parsed = orderRegistrationResponseSchema.parse({
      returns,
      entries: {
        barcode: '123',
        id: 'uuid',
        order_id: 1,
        status: 0,
        first_name: 'A',
        last_name: 'B',
        state_code: '1',
        city_code: 1,
        send_price: 10,
        send_price_tax: 1,
        insurance_price: 2,
        insurance_tax: 1,
        created_at: '2026-01-01 00:00:00',
        total_price: 14,
        total_send_price_discount: 0,
        product_price: 100,
        pre_paid_price: 0,
        final_pay_price: 0,
        future_field: 'kept',
      },
    });
    expect(parsed.entries.future_field).toBe('kept');
  });
  it('rejects floating point financial fields', () => {
    expect(() => quoteResponseSchema.parse({ returns, entries: { send_price: 1.5 } })).toThrow();
  });
  it('parses official location trees and status pages', () => {
    expect(
      locationTreeResponseSchema.parse({
        returns,
        entries: [{ code: 1, title: 'تهران', cities: [{ code: 1, title: 'تهران' }] }],
      }).entries,
    ).toHaveLength(1);
    expect(
      locationTreeResponseSchema.parse({
        returns,
        entries: { list: [{ code: 1, title: 'تهران' }], count: 1, page: 1, total_count: 31 },
      }).entries,
    ).toMatchObject({ total_count: 31 });
    expect(
      statusListResponseSchema.parse({
        returns,
        entries: { list: [{ order_id: 1, status: 7 }], count: 1, page: 1, total_count: 1 },
      }).entries.list[0]?.status,
    ).toBe(7);
  });
  it('bounds financial requests and requires safe callback URLs', () => {
    expect(
      createPaymentRequestSchema.parse({
        shop_id: 'shop-1',
        price: '100000',
        redirect_page: 'https://shop.example/payment-return',
      }).price,
    ).toBe(100000);
    expect(() =>
      createPaymentRequestSchema.parse({
        shop_id: 'shop-1',
        price: 100000,
        redirect_page: 'http://shop.example/payment-return',
      }),
    ).toThrow();
  });
  it('requires the provider-facing manual id and complete registration shape', () => {
    const contract = endpointContracts['order/post/register/'];
    expect(contract.request.safeParse({ register_type: 0, shop_id: 'shop-1' }).success).toBe(false);
  });
  it('requires exactly one provider identifier when editing an order', () => {
    const base = {
      shop_id: 'shop-1',
      address: 'Receiver address',
      city_code: 1,
      province_code: 1,
      email: null,
      employee_code: -1,
      first_name: 'A',
      last_name: 'B',
      mobile: '09121111111',
      phone: null,
      postal_code: '1313131313',
      pay_type: 1,
      order_type: 1,
      packet_type: 2,
      box_id: 10,
      package_weight: 10,
      products: [
        { count: 1, discount: 0, price: 5000, title: 'Book', weight: 500, product_id: null },
      ],
    };
    expect(orderEditRequestSchema.safeParse({ ...base, order_id: 1 }).success).toBe(true);
    expect(
      orderEditRequestSchema.safeParse({ ...base, order_id: 1, manual_id: 'duplicate' }).success,
    ).toBe(false);
  });
});
