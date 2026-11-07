import { z } from 'zod';

declare const irrBrand: unique symbol;
export type Irr = bigint & { readonly [irrBrand]: 'IRR' };
export const irr = (value: bigint): Irr => {
  if (value < 0n) throw new RangeError('IRR amount cannot be negative');
  return value as Irr;
};
export const tomanToIrr = (value: bigint): Irr => irr(value * 10n);
export const irrToToman = (value: Irr): bigint => {
  if (value % 10n !== 0n) throw new RangeError('IRR amount is not exactly representable in toman');
  return value / 10n;
};
export const toWireAmount = (value: Irr): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('IRR amount exceeds the provider wire-number safe range');
  return Number(value);
};
export const moneySchema = z.object({
  value: z.bigint().nonnegative().transform(irr),
  currency: z.literal('IRR'),
});
export type Money = z.infer<typeof moneySchema>;
export type TapinCharges = {
  productValue: Irr;
  postage: Irr;
  packaging: Irr;
  insurance: Irr;
  codCollection: Irr;
  walletDeduction: Irr;
};
export const calculateChargeTotals = (charges: TapinCharges) => ({
  shipmentCost: irr(charges.postage + charges.packaging + charges.insurance),
  receiverCollection: charges.codCollection,
  walletDeduction: charges.walletDeduction,
});
