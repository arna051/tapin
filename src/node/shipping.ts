import type { TapinClient } from './index.js';
import { shippingQuoteInputSchema, tapinCodes, type ShippingQuoteInput } from '../domain.js';
import { irr, toWireAmount } from '../money.js';

export type ShippingServiceOptions = { clock?: () => Date };
export function createTapinShippingService(
  client: TapinClient,
  options: ShippingServiceOptions = {},
) {
  const clock = options.clock ?? client.runtime.now;
  return {
    async quote(input: ShippingQuoteInput) {
      const value = shippingQuoteInputSchema.parse(input);
      const response = await client.orders.checkPrice({
        shop_id: value.shopId,
        address: value.destination.address,
        city_code: value.destination.cityCode,
        province_code: value.destination.provinceCode,
        postal_code: value.destination.postalCode,
        first_name: value.receiver.firstName,
        last_name: value.receiver.lastName,
        mobile: value.receiver.mobile,
        ...(value.receiver.phone ? { phone: value.receiver.phone } : {}),
        ...(value.receiver.email ? { email: value.receiver.email } : {}),
        employee_code: -1,
        pay_type: tapinCodes.payment[value.payment],
        order_type: tapinCodes.service[value.service],
        box_id: value.parcel.boxId,
        packet_type: tapinCodes.package[value.parcel.packageType],
        package_weight: value.parcel.packagingWeightGrams,
        packaging_price: toWireAmount(value.parcel.packagingCharge.value),
        content_type: tapinCodes.content[value.parcel.contentType],
        has_insurance: value.parcel.insurance === 'tapin',
        ...(value.parcel.locker
          ? {
              kiosk_id: value.parcel.locker.kioskId,
              duration: value.parcel.locker.retentionHours,
              parcel_turning: value.parcel.locker.canRotate,
            }
          : {}),
        products: value.parcel.products.map((product) => ({
          title: product.title,
          count: product.count,
          price: toWireAmount(product.unitValue.value),
          discount: product.discount ? toWireAmount(product.discount.value) : 0,
          weight: product.weightGrams,
          product_id: product.providerProductId ?? null,
        })),
      });
      return {
        quotedAt: clock(),
        total: { value: irr(BigInt(response.entries.total_price)), currency: 'IRR' as const },
        totalWeightGrams: response.entries.total_weight,
        raw: response.entries,
      };
    },
  };
}
