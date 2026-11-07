import { z } from 'zod';

export const providerReturnsSchema = z.object({ status: z.number().int(), message: z.string() });
export const providerEnvelope = <T extends z.ZodType>(entries: T) =>
  z.looseObject({ returns: providerReturnsSchema, entries });
const wireAmount = z.number().int().nonnegative();
const providerId = z.union([z.string().min(1), z.number().int()]);
const pageRequestSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  page: z.coerce.number().int().min(1).max(1_000_000),
});
const pageEntriesSchema = <T extends z.ZodType>(item: T) =>
  z.looseObject({
    list: z.array(item),
    count: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    total_count: z.number().int().nonnegative(),
  });

export const orderRegistrationEntriesSchema = z.looseObject({
  barcode: z.string(),
  id: z.string().min(1),
  order_id: z.number().int(),
  status: z.number().int(),
  first_name: z.string(),
  last_name: z.string(),
  state_code: providerId,
  city_code: providerId,
  send_price: wireAmount,
  send_price_tax: wireAmount,
  insurance_price: wireAmount,
  insurance_tax: wireAmount,
  created_at: z.string(),
  total_price: wireAmount,
  total_send_price_discount: wireAmount,
  product_price: wireAmount,
  pre_paid_price: wireAmount,
  final_pay_price: wireAmount,
});
export const orderRegistrationResponseSchema = providerEnvelope(orderRegistrationEntriesSchema);
export type OrderRegistrationResponse = z.infer<typeof orderRegistrationResponseSchema>;
const orderProductRequestSchema = z.object({
  count: z.number().int().positive().max(10_000),
  discount: wireAmount,
  price: wireAmount,
  title: z.string().trim().min(1).max(100),
  weight: z.number().int().positive().max(30_000),
  product_id: z.union([z.number().int().positive(), z.string().trim().min(1), z.null()]),
});
export const orderRegistrationRequestSchema = z.object({
  register_type: z.number().int().min(0).max(2),
  shop_id: z.string().trim().min(1).max(128),
  address: z.string().trim().min(3).max(300),
  city_code: providerId,
  province_code: providerId,
  description: z.string().max(250).nullable().optional(),
  email: z.union([z.email(), z.null()]),
  employee_code: providerId,
  first_name: z.string().trim().min(1).max(30),
  last_name: z.string().trim().min(1).max(40),
  mobile: z.string().regex(/^0?9\d{9}$/),
  phone: z.union([z.string().regex(/^\d{7,15}$/), z.null()]),
  postal_code: z.string().regex(/^\d{10}$/),
  pay_type: z.coerce.number().int().min(0).max(3),
  order_type: z.coerce.number().int().nonnegative(),
  packet_type: z.coerce.number().int().min(1).max(3),
  box_id: z.number().int().positive(),
  pre_paid_price: wireAmount.optional(),
  packaging_price: wireAmount.optional(),
  package_weight: z.number().int().nonnegative().max(30_000),
  presenter_code: providerId.optional(),
  manual_id: z.string().trim().min(1).max(128),
  has_insurance: z
    .union([z.boolean(), z.literal(0), z.literal(1), z.literal('true'), z.literal('false')])
    .optional(),
  content_type: z.coerce.number().int().min(1).max(3).optional(),
  kiosk_id: z.number().int().positive().optional(),
  duration: z.literal(48).optional(),
  parcel_turning: z.boolean().optional(),
  products: z.array(orderProductRequestSchema).min(1).max(100),
});
export type ProviderOrderRegistrationInput = z.input<typeof orderRegistrationRequestSchema>;
export const orderQuoteRequestSchema = orderRegistrationRequestSchema
  .omit({ register_type: true, manual_id: true })
  .extend({
    email: z.union([z.email(), z.null()]).optional(),
    phone: z.union([z.string().regex(/^\d{7,15}$/), z.null()]).optional(),
  });
export const orderEditRequestSchema = orderRegistrationRequestSchema
  .omit({ register_type: true, manual_id: true })
  .extend({
    id: z.string().trim().min(1).max(128).optional(),
    order_id: z.number().int().positive().optional(),
    manual_id: z.string().trim().min(1).max(128).optional(),
  })
  .superRefine((value, context) => {
    const identifiers = [value.id, value.order_id, value.manual_id].filter(
      (identifier) => identifier !== undefined,
    );
    if (identifiers.length !== 1)
      context.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Exactly one of id, order_id, or manual_id is required',
      });
  });

export const quoteEntriesSchema = z.looseObject({
  send_price: wireAmount,
  send_price_tax: wireAmount,
  service_price: wireAmount,
  service_price_tax: wireAmount,
  post_service_price: wireAmount,
  post_service_price_tax: wireAmount,
  sms_price: wireAmount,
  sms_price_tax: wireAmount,
  logistic_price: wireAmount,
  logistic_price_tax: wireAmount,
  post_pickup_price: wireAmount,
  post_pickup_price_tax: wireAmount,
  tapin_pickup_price: wireAmount,
  tapin_pickup_price_tax: wireAmount,
  kiosk_price: wireAmount,
  kiosk_price_tax: wireAmount,
  total_send_price: wireAmount,
  total_service_price: wireAmount,
  total_price: wireAmount,
  total_send_price_discount: wireAmount,
  total_weight: z.number().int().positive(),
});
export const quoteResponseSchema = providerEnvelope(quoteEntriesSchema);
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export const locationItemSchema = z.object({
  code: z.coerce.number().int().positive(),
  title: z.string().min(1),
});
export const locationTreeEntriesSchema = z.array(
  locationItemSchema.extend({ cities: z.array(locationItemSchema) }),
);
export const locationTreeResponseSchema = providerEnvelope(
  z.union([locationTreeEntriesSchema, pageEntriesSchema(locationItemSchema)]),
);
export const providerStatusItemSchema = z.looseObject({
  id: z.string().optional(),
  order_id: z.number().int(),
  barcode: z.string().optional(),
  status: z.number().int(),
  last_change_status: z.string().optional(),
  shop_id: z.string().optional(),
});
export const statusListResponseSchema = providerEnvelope(
  z.looseObject({
    list: z.array(providerStatusItemSchema),
    count: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    total_count: z.number().int().nonnegative(),
  }),
);
export const orderSummarySchema = z.looseObject({
  id: z.string().min(1),
  barcode: z.string().nullable(),
  order_id: z.number().int(),
  status: z.number().int(),
  first_name: z.string(),
  last_name: z.string(),
  mobile: z.string(),
  state_code: providerId,
  city_code: providerId,
  pay_type: providerId,
  order_type: providerId,
  created_at: z.string(),
});
export const orderListRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
  order_id: z.number().int().positive().optional(),
  barcode: z.string().trim().min(1).max(128).optional(),
  city_code: z.number().int().positive().optional(),
  province_code: z.number().int().positive().optional(),
  first_name: z.string().trim().min(1).max(30).optional(),
  last_name: z.string().trim().min(1).max(40).optional(),
  pay_type: z.number().int().min(0).max(3).optional(),
  order_type: z.number().int().nonnegative().optional(),
  status: z.number().int().optional(),
  created_at: z.string().trim().min(1).max(32).optional(),
});
export const orderDetailEntriesSchema = z.looseObject({
  id: z.string().min(1),
  barcode: z.string().nullable(),
  order_id: z.number().int(),
  status: z.number().int(),
  first_name: z.string(),
  last_name: z.string(),
  state_code: providerId,
  city_code: providerId,
  address: z.string(),
  postal_code: z.union([z.string(), z.number().int()]),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string(),
  pay_type: providerId,
  order_type: providerId,
  package_weight: z.number().int().nonnegative(),
  total_weight: z.number().int().positive(),
  factor_price: wireAmount,
  factor_title: z.string(),
  created_at: z.string(),
  products: z.array(
    z.looseObject({
      count: z.number().int().positive(),
      discount: wireAmount,
      price: wireAmount,
      title: z.string(),
      weight: z.number().int().positive(),
      product_id: z.union([z.number().int(), z.string(), z.null()]),
    }),
  ),
  kiosk_id: z.number().int().nullable().optional(),
});
export const changeStatusRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  order_id: z.number().int().positive(),
  status: z.number().int(),
});
const orderReferenceSchema = z.object({ id: z.string().trim().min(1).max(128) });
const orderIdsRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  orders_id: z.array(z.number().int().positive()).min(1).max(200),
});
const orderDetailRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  order_id: z.number().int().positive(),
});
const orderLabelsRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  orders: z.array(z.string().trim().min(1).max(128)).min(1).max(200),
});
const orderDateRangeRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  from_date: z.string().trim().min(1).max(32),
  to_date: z.string().trim().min(1).max(32),
});
export const changeStatusBulkRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  status: z.number().int(),
  orders: z.array(orderReferenceSchema).min(1).max(200),
});
export const statusBulkRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  orders: z.array(orderReferenceSchema).min(1).max(200),
});
export const statusReportRequestSchema = z.object({
  orders_id: z.array(z.number().int().positive()).min(1).max(200),
});
export const changeStatusReportRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
  date: z.string().trim().min(1).max(32).optional(),
});
export const lastChangeStatusRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128).optional(),
  from_date: z.string().trim().min(1).max(32),
  to_date: z.string().trim().min(1).max(32),
});
export const taskStatusSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export const taskDetailEntriesSchema = z.looseObject({
  id: z.string().min(1),
  task_type: z.number().int().min(0).max(4),
  task_status: taskStatusSchema,
  created_at: z.string(),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  has_downloadable_file: z.boolean(),
  task_result: z.array(z.unknown()),
});
export const taskDetailResponseSchema = providerEnvelope(taskDetailEntriesSchema);
export const taskListItemSchema = taskDetailEntriesSchema.pick({
  id: true,
  task_type: true,
  task_status: true,
  created_at: true,
});
export const taskListResponseSchema = providerEnvelope(pageEntriesSchema(taskListItemSchema));
export const taskDetailRequestSchema = z.object({
  task_id: z.string().trim().min(1).max(128),
});

export const productSchema = z.looseObject({
  product_id: z.number().int().nullable(),
  title: z.string(),
  category_id: z.string(),
  weight: z.number().int().positive().nullable(),
  price: wireAmount.nullable(),
  created_at: z.string().nullable(),
});
export const productCreateRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  category_id: z.string().trim().min(1).max(128),
  weight: z.number().int().positive().max(30_000),
  price: wireAmount,
  description: z.string().max(5_000).nullable(),
});
export const productUpdateRequestSchema = productCreateRequestSchema.extend({
  product_id: z.number().int().positive(),
});
export const productDeleteRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  product_id: z.number().int().positive(),
});
export const productListRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
  product_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  category_id: z.string().trim().min(1).max(128).optional(),
  weight: z.number().int().positive().max(30_000).optional(),
  price: wireAmount.optional(),
  created_at: z.string().trim().min(1).max(32).optional(),
});
export const productCategorySchema = z.looseObject({
  category_id: z.string().min(1),
  title: z.string(),
  parent_category_id: z.string().nullable(),
});

const httpsUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'URL must use HTTPS and must not contain credentials');
export const shopRequestSchema = z.object({ shop_id: z.string().trim().min(1).max(128) });
export const createPaymentRequestSchema = shopRequestSchema.extend({
  price: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  redirect_page: httpsUrlSchema,
});
export const createPaymentResponseSchema = providerEnvelope(
  z.looseObject({ url: httpsUrlSchema, transaction_pk: z.string().min(1) }),
);
export const creditResponseSchema = providerEnvelope(z.looseObject({ credit: wireAmount }));
export const paymentListRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
});
export const paymentSchema = z.looseObject({
  id: z.string().min(1),
  price: wireAmount,
  pay_type_description: z.string(),
  pay_type: z.number().int().min(-1).max(2),
  status: z.number().int().min(0).max(1),
  status_description: z.string(),
  create_at: z.string(),
});
export const shopSummarySchema = z.looseObject({ id: z.string().min(1), title: z.string() });
const base64ImageSchema = z
  .string()
  .max(1_400_000)
  .regex(/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const shopCreateRequestSchema = z
  .object({
    shop_name: z.string().trim().min(1).max(200),
    first_name: z.string().trim().min(1).max(30),
    last_name: z.string().trim().min(1).max(40),
    email: z.email(),
    father_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(7).max(15).optional(),
    mobile: z.string().regex(/^0?9\d{9}$/),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    certificate_code: z.string().trim().min(1).max(32),
    certificate_serial_number: z.string().trim().min(1).max(64),
    birthday_location: z.string().trim().min(1).max(200),
    national_code: z.string().regex(/^\d{10}$/),
    address: z.string().trim().min(3).max(500),
    province: z.number().int().positive(),
    city: z.number().int().positive(),
    postal_code: z.string().regex(/^\d{10}$/),
    unit: z.union([z.string().max(20), z.number().int().nonnegative()]),
    floor: z.union([z.string().max(20), z.number().int()]),
    plaque: z.union([z.string().max(20), z.number().int().nonnegative()]),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    website: z.string().trim().min(1).max(500),
    available_hours: z.string().trim().min(1).max(200),
    instagram_id: z.string().trim().min(1).max(100),
    shop_description: z.string().max(2_000).optional(),
    logo_image: base64ImageSchema,
    id_cart_image: base64ImageSchema,
    is_legal_shop: z.boolean(),
    company_name: z.string().trim().min(1).max(200).optional(),
    economic_code: z.string().trim().min(1).max(64).optional(),
    company_national_code: z.string().trim().min(1).max(64).optional(),
    register_code: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.is_legal_shop &&
      (!value.company_name ||
        !value.economic_code ||
        !value.company_national_code ||
        !value.register_code)
    )
      context.addIssue({
        code: 'custom',
        path: ['company_name'],
        message: 'Legal shops require complete company registration fields',
      });
  });
export const shopCreateResponseSchema = providerEnvelope(z.looseObject({ id: z.string().min(1) }));
export const shopDetailSchema = z.looseObject({
  title: z.string(),
  shop_message: z.string(),
  available_hours: z.string(),
  Province_code: z.number().int(),
  city_code: z.number().int(),
  address: z.string(),
  postal_code: z.union([z.string(), z.number().int()]),
});
export const customerSchema = z.looseObject({
  customer_id: z.string().min(1),
  category_id: z.string().min(1),
  phone: z.string().nullable().optional(),
  first_name: z.string(),
  last_name: z.string(),
  mobile: z.string(),
  email: z.string().nullable().optional(),
  postal_code: z.union([z.string(), z.number().int()]),
  created_at: z.string(),
  city: z.number().int(),
  state: z.number().int(),
});
export const customerListRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
  first_name: z.string().trim().min(1).max(100).optional(),
  category_id: z.string().trim().min(1).max(128).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  mobile: z.string().trim().min(1).max(20).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  email: z.email().optional(),
  postal_code: z.union([z.string(), z.number().int()]).optional(),
  state: z.number().int().positive().optional(),
  city: z.number().int().positive().optional(),
  created_at: z.string().trim().min(1).max(32).optional(),
});
export const customerCategorySchema = z.looseObject({
  category_parent_id: z.string(),
  category_id: z.string().min(1),
  title: z.string(),
});
export const employeeSchema = z.looseObject({
  first_name: z.string(),
  last_name: z.string(),
  username: z.string(),
  employee_code: z.union([z.string(), z.number().int()]),
});
export const shopPageRequestSchema = pageRequestSchema;
export const scopedPageRequestSchema = pageRequestSchema.extend({
  shop_id: z.string().trim().min(1).max(128),
});
export const locationTreeRequestSchema = z.union([pageRequestSchema, z.object({}).strict()]);
export const cityListRequestSchema = pageRequestSchema.extend({
  state_code: z.number().int().positive(),
});
export const kioskRequestSchema = z.object({
  shop_id: z.string().trim().min(1).max(128),
  province_code: z.number().int().positive(),
  city_code: z.number().int().positive(),
});
export const kioskSchema = z.looseObject({
  pk: z.number().int().positive(),
  post_unit_id: z.number().int().positive(),
  company: z.string(),
  address: z.string(),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
});
export const packingBoxSchema = z.looseObject({
  pk: z.number().int().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  title: z.string(),
});
export const genericEnvelopeSchema = providerEnvelope(z.unknown());
export const genericObjectRequestSchema = z.looseObject({});
const jsonContract = <
  Response extends z.ZodType = typeof genericEnvelopeSchema,
  Request extends z.ZodType = typeof genericObjectRequestSchema,
>(
  response: Response = genericEnvelopeSchema as unknown as Response,
  fidelity: 'audited' | 'envelope' = 'envelope',
  request: Request = genericObjectRequestSchema as unknown as Request,
) => ({ kind: 'json' as const, request, response, fidelity });
const documentContract = <Request extends z.ZodType>(request: Request) => ({
  kind: 'document' as const,
  request,
  fidelity: 'content-type-and-stream' as const,
});

export const endpointContracts = Object.freeze({
  'order/post/register/': jsonContract(
    orderRegistrationResponseSchema,
    'audited',
    orderRegistrationRequestSchema,
  ),
  'order/post/edit/': jsonContract(
    orderRegistrationResponseSchema,
    'audited',
    orderEditRequestSchema,
  ),
  'order/post/check-price/': jsonContract(quoteResponseSchema, 'audited', orderQuoteRequestSchema),
  'order/post/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(orderSummarySchema)),
    'audited',
    orderListRequestSchema,
  ),
  'order/post/detail/': jsonContract(
    providerEnvelope(orderDetailEntriesSchema),
    'audited',
    orderDetailRequestSchema,
  ),
  'order/post/detail/html/': documentContract(orderDetailRequestSchema),
  'order/post/detail/html/bulk/': documentContract(orderIdsRequestSchema),
  'order/post/detail/list/html/{order_id}': documentContract(
    z.object({ order_id: z.union([z.string().trim().min(1), z.number().int().positive()]) }),
  ),
  'order/post/detail/label/': documentContract(orderLabelsRequestSchema),
  'order/post/detail/label/date/': documentContract(orderDateRangeRequestSchema),
  'order/post/barcode/html/': documentContract(orderDateRangeRequestSchema),
  'order/post/change-status/': jsonContract(
    genericEnvelopeSchema,
    'audited',
    changeStatusRequestSchema,
  ),
  'order/post/change-status/bulk/': jsonContract(
    genericEnvelopeSchema,
    'audited',
    changeStatusBulkRequestSchema,
  ),
  'order/post/change-status/report/': jsonContract(
    statusListResponseSchema,
    'audited',
    changeStatusReportRequestSchema,
  ),
  'order/post/change-status/report/last-change-status/': jsonContract(
    statusListResponseSchema,
    'audited',
    lastChangeStatusRequestSchema,
  ),
  'order/post/get-status/bulk/': jsonContract(
    statusListResponseSchema,
    'audited',
    statusBulkRequestSchema,
  ),
  'order/post/get-status/report/': jsonContract(
    statusListResponseSchema,
    'audited',
    statusReportRequestSchema,
  ),
  'order/post/kiosk/': jsonContract(
    providerEnvelope(pageEntriesSchema(kioskSchema)),
    'audited',
    kioskRequestSchema,
  ),
  'order/post/packing-box/': jsonContract(
    providerEnvelope(pageEntriesSchema(packingBoxSchema)),
    'audited',
    shopRequestSchema,
  ),
  'product/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(productSchema)),
    'audited',
    productListRequestSchema,
  ),
  'product/create/': jsonContract(
    providerEnvelope(productSchema),
    'audited',
    productCreateRequestSchema,
  ),
  'product/update/': jsonContract(
    providerEnvelope(productSchema),
    'audited',
    productUpdateRequestSchema,
  ),
  'product/delete/': jsonContract(
    providerEnvelope(productSchema),
    'audited',
    productDeleteRequestSchema,
  ),
  'product/category/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(productCategorySchema)),
    'audited',
    pageRequestSchema,
  ),
  'shop/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(shopSummarySchema)),
    'audited',
    shopPageRequestSchema,
  ),
  'shop/create/': jsonContract(shopCreateResponseSchema, 'audited', shopCreateRequestSchema),
  'shop/detail/': jsonContract(providerEnvelope(shopDetailSchema), 'audited', shopRequestSchema),
  'state/tree/': jsonContract(locationTreeResponseSchema, 'audited', locationTreeRequestSchema),
  'city/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(locationItemSchema)),
    'audited',
    cityListRequestSchema,
  ),
  'transaction/credit/': jsonContract(creditResponseSchema, 'audited', shopRequestSchema),
  'transaction/indirect/new/': jsonContract(
    createPaymentResponseSchema,
    'audited',
    createPaymentRequestSchema,
  ),
  'transaction/online-increase-credit/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(paymentSchema)),
    'audited',
    paymentListRequestSchema,
  ),
  'task/list/': jsonContract(taskListResponseSchema, 'audited', pageRequestSchema),
  'task/detail/': jsonContract(taskDetailResponseSchema, 'audited', taskDetailRequestSchema),
  'customer/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(customerSchema)),
    'audited',
    customerListRequestSchema,
  ),
  'customer/category/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(customerCategorySchema)),
    'audited',
    scopedPageRequestSchema,
  ),
  'employee/list/': jsonContract(
    providerEnvelope(pageEntriesSchema(employeeSchema)),
    'audited',
    scopedPageRequestSchema,
  ),
});
