import { describe, expect, it } from 'vitest';
import { calculateChargeTotals, irr, irrToToman, toWireAmount, tomanToIrr } from '../src/money.js';

describe('money safety', () => {
  it('uses explicit IRR/toman conversions', () => {
    expect(tomanToIrr(10n)).toBe(100n);
    expect(irrToToman(irr(100n))).toBe(10n);
    expect(() => irrToToman(irr(101n))).toThrow('not exactly');
  });
  it('rejects negative and unsafe provider-wire amounts', () => {
    expect(() => irr(-1n)).toThrow('negative');
    expect(() => toWireAmount(irr(BigInt(Number.MAX_SAFE_INTEGER) + 1n))).toThrow('safe range');
  });
  it('keeps charge components separate', () => {
    const totals = calculateChargeTotals({
      productValue: irr(1_000n),
      postage: irr(100n),
      packaging: irr(20n),
      insurance: irr(5n),
      codCollection: irr(1_125n),
      walletDeduction: irr(105n),
    });
    expect(totals).toEqual({
      shipmentCost: 125n,
      receiverCollection: 1_125n,
      walletDeduction: 105n,
    });
  });
});
