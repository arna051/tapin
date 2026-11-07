import { createTapinClient, createTapinShippingService } from 'tapin/node';

const token = process.env.TAPIN_TOKEN;
if (!token) throw new Error('TAPIN_TOKEN is required');

const client = createTapinClient({ token });
const shipping = createTapinShippingService(client);

const quote = await shipping.quote({
  shopId: process.env.TAPIN_SHOP_ID ?? '',
  destination: {
    provinceCode: 1,
    cityCode: 1,
    postalCode: '1234567890',
    address: 'Example address',
  },
  receiver: { firstName: 'Example', lastName: 'Recipient', mobile: '09123456789' },
  service: 'pishtaz',
  payment: 'sender_paid',
  parcel: {
    productWeightGrams: 700,
    packagingWeightGrams: 150,
    boxId: 10,
    packageType: 'package',
    contentType: 'normal',
    packagingCharge: { value: 0n, currency: 'IRR' },
    insurance: 'post',
    products: [
      {
        title: 'Example product',
        count: 1,
        unitValue: { value: 1_000_000n, currency: 'IRR' },
        weightGrams: 700,
      },
    ],
  },
});
console.log({ totalIrr: quote.total.value.toString(), totalWeightGrams: quote.totalWeightGrams });
