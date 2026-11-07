import { z } from 'zod';

export const TAPIN_API_BASE_URL = 'https://api.tapin.ir/api/v2/public/' as const;

export const endpointPaths = {
  orders: {
    register: 'order/post/register/',
    edit: 'order/post/edit/',
    checkPrice: 'order/post/check-price/',
    list: 'order/post/list/',
    detail: 'order/post/detail/',
    detailHtml: 'order/post/detail/html/',
    detailHtmlBulk: 'order/post/detail/html/bulk/',
    detailListHtml: 'order/post/detail/list/html/{order_id}',
    label: 'order/post/detail/label/',
    labelByDate: 'order/post/detail/label/date/',
    changeStatus: 'order/post/change-status/',
    changeStatusBulk: 'order/post/change-status/bulk/',
    changeStatusReport: 'order/post/change-status/report/',
    lastChangeStatus: 'order/post/change-status/report/last-change-status/',
    statusBulk: 'order/post/get-status/bulk/',
    statusReport: 'order/post/get-status/report/',
    barcodeHtml: 'order/post/barcode/html/',
    kiosks: 'order/post/kiosk/',
    packingBoxes: 'order/post/packing-box/',
  },
  products: {
    list: 'product/list/',
    create: 'product/create/',
    update: 'product/update/',
    delete: 'product/delete/',
    categories: 'product/category/list/',
  },
  shops: { list: 'shop/list/', create: 'shop/create/', detail: 'shop/detail/' },
  locations: { tree: 'state/tree/', cities: 'city/list/' },
  finance: {
    credit: 'transaction/credit/',
    createPayment: 'transaction/indirect/new/',
    payments: 'transaction/online-increase-credit/list/',
  },
  tasks: { list: 'task/list/', detail: 'task/detail/' },
  customers: { list: 'customer/list/', categories: 'customer/category/list/' },
  employees: { list: 'employee/list/' },
} as const;

export const endpointHttpMethod = (path: string): 'GET' | 'POST' =>
  path === endpointPaths.orders.detailListHtml ? 'GET' : 'POST';

export type EndpointCapability = Readonly<{
  mutates: boolean;
  financial: boolean;
  irreversible: boolean;
  response: 'json' | 'document';
}>;
const readJson = {
  mutates: false,
  financial: false,
  irreversible: false,
  response: 'json',
} as const;
const readDocument = {
  mutates: false,
  financial: false,
  irreversible: false,
  response: 'document',
} as const;
const mutation = {
  mutates: true,
  financial: false,
  irreversible: false,
  response: 'json',
} as const;
const committingMutation = {
  mutates: true,
  financial: true,
  irreversible: true,
  response: 'json',
} as const;
const consequentialMutation = {
  mutates: true,
  financial: true,
  irreversible: true,
  response: 'json',
} as const;
export const endpointCapabilities = {
  orders: {
    register: mutation,
    edit: mutation,
    checkPrice: readJson,
    list: readJson,
    detail: readJson,
    detailHtml: readDocument,
    detailHtmlBulk: readDocument,
    detailListHtml: readDocument,
    label: readDocument,
    labelByDate: readDocument,
    changeStatus: consequentialMutation,
    changeStatusBulk: consequentialMutation,
    changeStatusReport: readJson,
    lastChangeStatus: readJson,
    statusBulk: readJson,
    statusReport: readJson,
    barcodeHtml: readDocument,
    kiosks: readJson,
    packingBoxes: readJson,
  },
  products: {
    list: readJson,
    create: mutation,
    update: mutation,
    delete: mutation,
    categories: readJson,
  },
  shops: { list: readJson, create: mutation, detail: readJson },
  locations: { tree: readJson, cities: readJson },
  finance: { credit: readJson, createPayment: committingMutation, payments: readJson },
  tasks: { list: readJson, detail: readJson },
  customers: { list: readJson, categories: readJson },
  employees: { list: readJson },
} as const satisfies {
  [G in keyof typeof endpointPaths]: { [K in keyof (typeof endpointPaths)[G]]: EndpointCapability };
};

export const tapinEnvelopeSchema = z.object({
  returns: z.object({ status: z.number().int(), message: z.string() }),
  entries: z.unknown().optional(),
});
export type TapinEnvelope<T = unknown> = {
  returns: { status: number; message: string };
  entries?: T;
};
export type JsonRecord = Record<string, unknown>;

export class TapinError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'TapinError';
  }
  static [Symbol.hasInstance](value: unknown) {
    return (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      ['TapinError', 'TapinUnknownOutcomeError', 'TapinNotSentError'].includes(
        String((value as { name: unknown }).name),
      )
    );
  }
}
export class TapinUnknownOutcomeError extends TapinError {
  constructor(message: string, raw?: unknown) {
    super(message, undefined, raw);
    this.name = 'TapinUnknownOutcomeError';
  }
  static [Symbol.hasInstance](value: unknown) {
    return (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      (value as { name: unknown }).name === 'TapinUnknownOutcomeError'
    );
  }
}
export class TapinNotSentError extends TapinError {
  constructor(message: string, raw?: unknown) {
    super(message, undefined, raw);
    this.name = 'TapinNotSentError';
  }
  static [Symbol.hasInstance](value: unknown) {
    return (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      (value as { name: unknown }).name === 'TapinNotSentError'
    );
  }
}

export type TapinDiagnostic = Readonly<{
  category:
    | 'access_or_ip_restriction'
    | 'provider_rejection'
    | 'not_sent'
    | 'unknown_outcome'
    | 'transport';
  retrySafe: boolean;
  hint: string;
  httpStatus?: number;
  providerStatus?: number;
  transportCode?: string;
}>;

/** Returns telemetry-safe metadata and never includes request, response, token, or personal data. */
export function diagnoseTapinError(error: unknown): TapinDiagnostic {
  const value = error instanceof TapinError ? error : undefined;
  const raw =
    value?.raw && typeof value.raw === 'object'
      ? (value.raw as Record<string, unknown>)
      : undefined;
  const httpStatus =
    typeof raw?.httpStatus === 'number'
      ? raw.httpStatus
      : value?.code && value.code >= 100 && value.code <= 599
        ? value.code
        : undefined;
  const providerStatus = typeof raw?.providerStatus === 'number' ? raw.providerStatus : undefined;
  const transportCode = typeof raw?.code === 'string' ? raw.code : undefined;
  const status = httpStatus ?? providerStatus;
  if (status === 401 || status === 403)
    return Object.freeze({
      category: 'access_or_ip_restriction',
      retrySafe: false,
      hint: 'Verify the token, authorization scheme, account state, and configured source IP.',
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(providerStatus === undefined ? {} : { providerStatus }),
    });
  if (error instanceof TapinUnknownOutcomeError)
    return Object.freeze({
      category: 'unknown_outcome',
      retrySafe: false,
      hint: 'Reconcile by a documented provider or idempotency identifier before retrying.',
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(transportCode === undefined ? {} : { transportCode }),
    });
  if (error instanceof TapinNotSentError)
    return Object.freeze({
      category: 'not_sent',
      retrySafe: true,
      hint: 'Correct the local request or connectivity problem before retrying.',
      ...(transportCode === undefined ? {} : { transportCode }),
    });
  if (value)
    return Object.freeze({
      category: 'provider_rejection',
      retrySafe: false,
      hint: 'Inspect the documented provider status and correct the request or account state.',
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(providerStatus === undefined ? {} : { providerStatus }),
      ...(transportCode === undefined ? {} : { transportCode }),
    });
  return Object.freeze({
    category: 'transport',
    retrySafe: false,
    hint: 'Classify the failure before deciding whether retry is safe.',
  });
}

export type RegistrationMode = 'review' | 'print_ready' | 'send_ready';
export const registrationConsequences = {
  review: {
    commitsFunds: false,
    assignsBarcode: false,
    editable: true,
    handoffDeadlineHours: null,
  },
  print_ready: {
    commitsFunds: true,
    assignsBarcode: true,
    editable: false,
    handoffDeadlineHours: null,
  },
  send_ready: {
    commitsFunds: true,
    assignsBarcode: true,
    editable: false,
    handoffDeadlineHours: 24,
  },
} as const;
export const registrationRulesReviewedAt = '2026-11-06' as const;
export const orderRegisterCapability = (mode: RegistrationMode): EndpointCapability => ({
  mutates: true,
  financial: registrationConsequences[mode].commitsFunds,
  irreversible: registrationConsequences[mode].assignsBarcode,
  response: 'json',
});
