import { z } from 'zod';
import { moneySchema } from './money.js';

export const tapinCodes = {
  registrationMode: { review: 0, print_ready: 1, send_ready: 2 },
  service: { pishtaz: 1, special: 3, express: 5 },
  payment: { cod: 0, sender_paid: 1, postage_due: 2, free_shipping: 3 },
  content: { normal: 1, fragile: 2, liquid: 3 },
  package: { envelope: 1, package: 2, padded_envelope: 3 },
} as const;

export const registrationModeSchema = z.enum(['review', 'print_ready', 'send_ready']);
export const serviceSchema = z.enum(['pishtaz', 'special', 'express']);
export const paymentTypeSchema = z.enum(['cod', 'sender_paid', 'postage_due', 'free_shipping']);
export const contentTypeSchema = z.enum(['normal', 'fragile', 'liquid']);
export const packageTypeSchema = z.enum(['envelope', 'package', 'padded_envelope']);
export { moneySchema } from './money.js';
export const weightSchema = z.object({
  productWeightGrams: z.number().int().positive(),
  packagingWeightGrams: z.number().int().nonnegative(),
});
export const addressSchema = z.object({
  provinceCode: z.number().int().positive(),
  cityCode: z.number().int().positive(),
  postalCode: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
  address: z.string().trim().min(3).max(500).optional(),
});
export const quoteInputSchema = z.object({
  origin: addressSchema.pick({ provinceCode: true, cityCode: true }),
  destination: addressSchema,
  parcel: weightSchema.extend({
    packageType: packageTypeSchema,
    contentType: contentTypeSchema,
    declaredValue: moneySchema,
  }),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export const receiverSchema = z.object({
  firstName: z.string().trim().min(1).max(30),
  lastName: z.string().trim().min(1).max(40),
  mobile: z.string().regex(/^\d{10,15}$/),
  phone: z
    .string()
    .regex(/^\d{7,15}$/)
    .optional(),
  email: z.email().optional(),
});
export const productLineSchema = z.object({
  title: z.string().trim().min(1).max(100),
  count: z.number().int().positive(),
  unitValue: moneySchema,
  discount: moneySchema.optional(),
  weightGrams: z.number().int().positive(),
  providerProductId: z.union([z.string(), z.number().int()]).optional(),
});
export const shippingQuoteInputSchema = z
  .object({
    shopId: z.string().min(1),
    destination: addressSchema.required({ postalCode: true, address: true }),
    receiver: receiverSchema,
    service: serviceSchema,
    payment: paymentTypeSchema,
    parcel: weightSchema.extend({
      boxId: z.number().int().positive(),
      packageType: packageTypeSchema,
      contentType: contentTypeSchema,
      packagingCharge: moneySchema,
      insurance: z.enum(['tapin', 'post']),
      products: z.array(productLineSchema).min(1),
      locker: z
        .object({
          kioskId: z.number().int().positive(),
          retentionHours: z.literal(48),
          canRotate: z.boolean(),
        })
        .optional(),
    }),
  })
  .superRefine((value, context) => {
    const total = value.parcel.productWeightGrams + value.parcel.packagingWeightGrams;
    const maximum =
      value.parcel.packageType === 'envelope'
        ? 500
        : value.parcel.packageType === 'padded_envelope'
          ? 2_000
          : 30_000;
    if (total < 50 || total > maximum)
      context.addIssue({
        code: 'custom',
        path: ['parcel'],
        message: `Total parcel weight must be between 50 and ${maximum} grams for ${value.parcel.packageType}`,
      });
  });
export type ShippingQuoteInput = z.input<typeof shippingQuoteInputSchema>;

export const shipmentStates = [
  'draft',
  'review',
  'barcode_assigned',
  'ready_to_send',
  'collecting',
  'accepted',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returning',
  'returned',
  'damaged',
  'missing_or_disordered',
  'cancelled',
  'deleted',
  'unknown',
] as const;
export type ShipmentState = (typeof shipmentStates)[number];
export const shipmentStateSchema = z.enum(shipmentStates);

const transitions: Readonly<Record<ShipmentState, readonly ShipmentState[]>> = {
  draft: ['review', 'cancelled', 'deleted'],
  review: ['barcode_assigned', 'ready_to_send', 'cancelled', 'deleted'],
  barcode_assigned: ['ready_to_send', 'collecting', 'cancelled'],
  ready_to_send: ['collecting', 'accepted', 'cancelled'],
  collecting: ['accepted', 'missing_or_disordered'],
  accepted: ['in_transit', 'returning', 'damaged', 'missing_or_disordered'],
  in_transit: [
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'returning',
    'damaged',
    'missing_or_disordered',
  ],
  out_for_delivery: ['delivered', 'delivery_failed', 'returning'],
  delivered: [],
  delivery_failed: ['out_for_delivery', 'returning', 'returned'],
  returning: ['returned', 'damaged', 'missing_or_disordered'],
  returned: [],
  damaged: ['returning', 'returned'],
  missing_or_disordered: ['in_transit', 'returning', 'returned'],
  cancelled: ['deleted'],
  deleted: [],
  unknown: shipmentStates,
};
export const allowedShipmentTransitions = Object.freeze(transitions);
export const canTransitionShipment = (from: ShipmentState, to: ShipmentState) =>
  from === to || transitions[from].includes(to);
export function assertShipmentTransition(from: ShipmentState, to: ShipmentState): void {
  if (!canTransitionShipment(from, to))
    throw new RangeError(`Illegal Tapin shipment transition: ${from} -> ${to}`);
}

export type NormalizedShipmentStatus = {
  state: ShipmentState;
  rawCode: number | string;
  rawLabel?: string;
  observedAt?: Date;
  operationalKind?: 'delivery' | 'financial' | 'workflow';
};
export const preserveUnknownStatus = (
  rawCode: number | string,
  rawLabel?: string,
): NormalizedShipmentStatus => ({ state: 'unknown', rawCode, ...(rawLabel ? { rawLabel } : {}) });
