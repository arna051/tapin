import { diagnoseTapinError, type TapinDiagnostic } from '../core.js';
import type { TapinClient } from './index.js';

export type TapinAccountVerification =
  | Readonly<{
      ok: true;
      checkedAt: Date;
      visibleShopCount: number;
      totalShopCount: number;
    }>
  | Readonly<{
      ok: false;
      checkedAt: Date;
      diagnostic: TapinDiagnostic;
    }>;

/** Performs one bounded read-only shop-list call. It never creates parcels or mutates finance. */
export async function verifyTapinAccount(
  client: TapinClient,
  options: { clock?: () => Date; signal?: AbortSignal } = {},
): Promise<TapinAccountVerification> {
  const checkedAt = (options.clock ?? client.runtime.now)();
  try {
    const response = await client.shops.list(
      { count: 1, page: 1 },
      options.signal ? { signal: options.signal } : undefined,
    );
    return Object.freeze({
      ok: true as const,
      checkedAt,
      visibleShopCount: response.entries.list.length,
      totalShopCount: response.entries.total_count,
    });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      checkedAt,
      diagnostic: diagnoseTapinError(error),
    });
  }
}
