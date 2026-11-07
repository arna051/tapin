import { describe, expect, it } from 'vitest';
import { createTapinClient } from '../src/node/index.js';
import { verifyTapinAccount } from '../src/node/diagnostics.js';
import { FakeTapinTransport, successEnvelope } from '../src/testing/index.js';

describe('safe account verification', () => {
  it('uses only one bounded read-only shop request', async () => {
    const transport = new FakeTapinTransport({
      'shop/list/': successEnvelope({
        list: [{ id: 'shop-1', title: 'Shop' }],
        count: 1,
        page: 1,
        total_count: 3,
      }),
    });
    const result = await verifyTapinAccount(createTapinClient({ token: 'secret', transport }), {
      clock: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).toEqual({
      ok: true,
      checkedAt: new Date('2026-01-01T00:00:00Z'),
      visibleShopCount: 1,
      totalShopCount: 3,
    });
    expect(transport.calls).toEqual([{ path: 'shop/list/', input: { count: 1, page: 1 } }]);
  });

  it('returns redacted access diagnostics on rejection', async () => {
    const transport = {
      post: async () => {
        throw Object.assign(new Error('denied secret-token'), {
          response: { status: 403 },
        });
      },
    };
    const result = await verifyTapinAccount(createTapinClient({ token: 'secret', transport }), {
      clock: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostic: { category: 'access_or_ip_restriction', retrySafe: false },
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
});
