import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import {
  createTapinClient,
  TapinNotSentError,
  TapinUnknownOutcomeError,
} from '../src/node/index.js';
import { tapinPlatformMessages, tapinPostalMessages } from '../src/error-codes.js';
import { FakeTapinTransport, successEnvelope } from '../src/testing/index.js';

const registerInput = {
  mode: 'review' as const,
  shop_id: 'shop-1',
  address: 'Tehran, Example Street',
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
  manual_id: 'manual-1',
  products: [{ count: 1, discount: 0, price: 5000, title: 'Book', weight: 500, product_id: null }],
};

describe('Tapin client safety', () => {
  it('uses injectable deterministic clock and IDs', () => {
    let sequence = 0;
    const client = createTapinClient({
      token: 'secret',
      clock: () => new Date('2026-01-01T00:00:00Z'),
      idGenerator: () => `id-${++sequence}`,
    });
    expect(client.runtime.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect([client.runtime.newId(), client.runtime.newId()]).toEqual(['id-1', 'id-2']);
  });
  it('uses the deterministic fake transport', async () => {
    const transport = new FakeTapinTransport({
      'shop/list/': successEnvelope({
        list: [{ id: '1', title: 'Shop' }],
        count: 1,
        page: 1,
        total_count: 1,
      }),
    });
    const result = await createTapinClient({ token: 'secret', transport }).shops.list({
      count: 10,
      page: 1,
    });
    expect(result.entries.list).toEqual([{ id: '1', title: 'Shop' }]);
  });

  it('provides documented convenience aliases without hiding raw methods', () => {
    const client = createTapinClient({ token: 'secret', transport: new FakeTapinTransport() });
    expect(client.locations.fetchTree).toBe(client.locations.tree);
    expect(client.finance.getBalance).toBe(client.finance.credit);
  });

  it('enforces endpoint request contracts before using the transport', async () => {
    const transport = new FakeTapinTransport();
    await expect(
      createTapinClient({ token: 'secret', transport }).shops.list([] as never),
    ).rejects.toBeInstanceOf(TapinNotSentError);
    expect(transport.calls).toHaveLength(0);
  });

  it('enforces audited endpoint response contracts', async () => {
    const transport = new FakeTapinTransport({
      'state/tree/': successEnvelope([{ code: 1, title: 'Tehran', cities: 'invalid' }]),
    });
    await expect(
      createTapinClient({ token: 'secret', transport }).locations.tree(),
    ).rejects.toThrow('invalid response envelope');
  });

  it('preserves every documented provider and postal error code before parsing entries', async () => {
    for (const catalogue of [tapinPlatformMessages, tapinPostalMessages]) {
      for (const [rawCode, message] of Object.entries(catalogue)) {
        const code = Number(rawCode);
        if (code >= 200 && code < 300) continue;
        const transport = new FakeTapinTransport({
          'shop/list/': { returns: { status: code, message } },
        });
        const failure = createTapinClient({
          token: 'secret',
          transport,
          retryReads: false,
        }).shops.list({ count: 1, page: 1 });
        await expect(failure).rejects.toMatchObject({
          name: 'TapinError',
          code,
          raw: { providerStatus: code },
        });
      }
    }
  });

  it('sends only allowlisted parsed fields for audited resources', async () => {
    const transport = new FakeTapinTransport({
      'transaction/credit/': successEnvelope({ credit: 10 }),
    });
    await createTapinClient({ token: 'secret', transport }).finance.credit({
      shop_id: ' shop-1 ',
      injected: 'must-not-be-sent',
    });
    expect(transport.calls[0]?.input).toEqual({ shop_id: 'shop-1' });
  });

  it('interpolates and removes order_id from templated paths', async () => {
    const calls: Array<{ path: string; input: unknown }> = [];
    const transport = {
      post: async () => {
        throw new Error('unexpected POST');
      },
      get: async (path: string) => {
        calls.push({ path, input: {} });
        return { data: Readable.from('html'), headers: { 'content-type': 'text/html' } };
      },
    };
    await createTapinClient({ token: 'secret', transport }).orders.detailListHtml({
      order_id: 123,
    });
    expect(calls[0]).toEqual({ path: 'order/post/detail/list/html/123', input: {} });
  });

  it('classifies malformed mutation responses as unknown outcomes', async () => {
    const transport = { post: async () => ({ data: '<html>gateway response</html>' }) };
    const promise = createTapinClient({ token: 'secret', transport }).orders.register({
      ...registerInput,
    });
    await expect(promise).rejects.toBeInstanceOf(TapinUnknownOutcomeError);
  });

  it('requires normalized registration mode and maps it to provider codes', async () => {
    const transport = new FakeTapinTransport({
      'order/post/register/': successEnvelope({
        barcode: '',
        id: 'uuid',
        order_id: 1,
        status: 0,
        first_name: 'A',
        last_name: 'B',
        state_code: 1,
        city_code: 1,
        send_price: 10,
        send_price_tax: 1,
        insurance_price: 2,
        insurance_tax: 1,
        created_at: '2026-01-01',
        total_price: 14,
        total_send_price_discount: 0,
        product_price: 100,
        pre_paid_price: 0,
        final_pay_price: 0,
      }),
    });
    await createTapinClient({ token: 'secret', transport }).orders.register({
      ...registerInput,
    });
    expect(transport.calls[0]?.input.register_type).toBe(0);
    expect(transport.calls[0]?.input.mode).toBeUndefined();
  });

  it('rejects raw registration codes', async () => {
    const transport = new FakeTapinTransport();
    expect(() =>
      createTapinClient({ token: 'secret', transport }).orders.register({
        ...registerInput,
        register_type: 2,
      } as never),
    ).toThrow('Use mode');
  });

  it('classifies serialization and connection-refused failures as not sent', async () => {
    const unused = { post: async () => ({ data: successEnvelope({}) }) };
    await expect(
      createTapinClient({ token: 'secret', transport: unused }).shops.list({
        value: 1n,
      }),
    ).rejects.toBeInstanceOf(TapinNotSentError);
    const refused = {
      post: async () => {
        throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
      },
    };
    await expect(
      createTapinClient({ token: 'secret', transport: refused }).orders.register({
        ...registerInput,
      }),
    ).rejects.toBeInstanceOf(TapinNotSentError);
  });

  it('keeps mutation timeouts as unknown outcomes', async () => {
    const timeout = {
      post: async () => {
        throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
      },
    };
    await expect(
      createTapinClient({ token: 'secret', transport: timeout }).orders.register({
        ...registerInput,
      }),
    ).rejects.toBeInstanceOf(TapinUnknownOutcomeError);
  });

  it('retries bounded safe reads but never mutations', async () => {
    let readAttempts = 0;
    const readTransport = {
      post: async () => {
        readAttempts += 1;
        if (readAttempts < 3) throw Object.assign(new Error('temporary'), { code: 'ECONNRESET' });
        return {
          data: successEnvelope({ list: [], count: 0, page: 1, total_count: 0 }),
        };
      },
    };
    await createTapinClient({
      token: 'secret',
      transport: readTransport,
      retryReads: { maxAttempts: 3, baseDelayMs: 1 },
      delay: async () => undefined,
    }).shops.list({ count: 10, page: 1 });
    expect(readAttempts).toBe(3);
    let mutationAttempts = 0;
    const mutationTransport = {
      post: async () => {
        mutationAttempts += 1;
        throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
      },
    };
    await expect(
      createTapinClient({
        token: 'secret',
        transport: mutationTransport,
        retryReads: { maxAttempts: 5 },
        delay: async () => undefined,
      }).orders.register(registerInput),
    ).rejects.toBeInstanceOf(TapinUnknownOutcomeError);
    expect(mutationAttempts).toBe(1);
  });

  it('streams safe document responses and sanitizes filenames', async () => {
    const transport = {
      post: async () => ({
        data: Readable.from('pdf'),
        headers: {
          'content-type': 'application/pdf',
          'content-length': '3',
          'content-disposition': 'attachment; filename="../label.pdf"',
        },
      }),
    };
    const document = await createTapinClient({ token: 'secret', transport }).orders.label({
      shop_id: 'shop-1',
      orders: ['order-1'],
    });
    expect(document.contentType).toBe('application/pdf');
    expect(document.filename).toBe('.._label.pdf');
    expect(document.stream).toBeInstanceOf(Readable);
  });

  it('rejects unsafe document content types', async () => {
    const transport = {
      post: async () => ({
        data: Readable.from('x'),
        headers: { 'content-type': 'application/javascript' },
      }),
    };
    await expect(
      createTapinClient({ token: 'secret', transport }).orders.label({
        shop_id: 'shop-1',
        orders: ['order-1'],
      }),
    ).rejects.toThrow('unsafe document content type');
  });

  it('terminates chunked document streams that exceed the size limit', async () => {
    const transport = {
      post: async () => ({
        data: Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
        headers: { 'content-type': 'application/pdf' },
      }),
    };
    const document = await createTapinClient({
      token: 'secret',
      transport,
      maxDocumentBytes: 10,
    }).orders.label({ shop_id: 'shop-1', orders: ['order-1'] });
    const consume = async () => {
      for await (const chunk of document.stream as Readable) {
        // Consume the stream to exercise the incremental byte limit.
        void chunk;
      }
    };
    await expect(consume()).rejects.toThrow('exceeds the configured size limit');
  });
});
