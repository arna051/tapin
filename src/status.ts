import type { NormalizedShipmentStatus, ShipmentState } from './domain.js';

export type TapinStatusDefinition = Readonly<{
  code: number;
  label: string;
  state: ShipmentState;
  operationalKind: 'delivery' | 'financial' | 'workflow';
}>;
export const tapinStatusDefinitions: readonly TapinStatusDefinition[] = Object.freeze([
  { code: -100, label: 'منتظر استعلام (API)', state: 'unknown', operationalKind: 'workflow' },
  {
    code: -1,
    label: 'ثبت شده در فروشگاه (تحت بررسی) (API)',
    state: 'review',
    operationalKind: 'workflow',
  },
  {
    code: 0,
    label: 'ثبت شده در فروشگاه (تحت بررسی)',
    state: 'review',
    operationalKind: 'workflow',
  },
  {
    code: 1,
    label: 'آماده به پرینت (معلق پستی)',
    state: 'barcode_assigned',
    operationalKind: 'workflow',
  },
  { code: 2, label: 'آماده به ارسال', state: 'ready_to_send', operationalKind: 'workflow' },
  {
    code: 3,
    label: 'اشتباه در اعلام آماده به ارسال',
    state: 'delivery_failed',
    operationalKind: 'workflow',
  },
  { code: 4, label: 'عدم حضور فروشگاه', state: 'delivery_failed', operationalKind: 'workflow' },
  { code: 5, label: 'قبول شد', state: 'accepted', operationalKind: 'delivery' },
  {
    code: 6,
    label: 'عدم قبول (غیر قابل توزیع در مبدا)',
    state: 'delivery_failed',
    operationalKind: 'delivery',
  },
  { code: 7, label: 'توزیع شد', state: 'delivered', operationalKind: 'delivery' },
  { code: 8, label: 'باجه معطل', state: 'delivery_failed', operationalKind: 'delivery' },
  {
    code: 9,
    label: 'غیر قابل توزیع (غیر قابل توزیع در مقصد)',
    state: 'delivery_failed',
    operationalKind: 'delivery',
  },
  { code: 10, label: 'پیش برگشتی مرسوله', state: 'returning', operationalKind: 'delivery' },
  { code: 11, label: 'ثبت نهایی برگشتی', state: 'returned', operationalKind: 'delivery' },
  { code: 12, label: 'مرسوله خسارتی', state: 'damaged', operationalKind: 'delivery' },
  { code: 13, label: 'وارد شده به استان توزیع', state: 'in_transit', operationalKind: 'delivery' },
  { code: 14, label: 'تحویل به نامه رسان', state: 'out_for_delivery', operationalKind: 'delivery' },
  { code: 15, label: 'مراجعه اول', state: 'out_for_delivery', operationalKind: 'delivery' },
  { code: 16, label: 'مراجعه دوم', state: 'out_for_delivery', operationalKind: 'delivery' },
  { code: 17, label: 'توزیع در صندوق پستی', state: 'delivered', operationalKind: 'delivery' },
  {
    code: 18,
    label: 'بی ترتیبی (کسری مرسوله)',
    state: 'missing_or_disordered',
    operationalKind: 'delivery',
  },
  { code: 50, label: 'در حال جمع‌آوری', state: 'collecting', operationalKind: 'delivery' },
  { code: 70, label: 'تایید شده مدیر مالی', state: 'unknown', operationalKind: 'financial' },
  { code: 71, label: 'تسویه شده مدیر مالی', state: 'unknown', operationalKind: 'financial' },
  { code: 72, label: 'تسویه شده با پست', state: 'unknown', operationalKind: 'financial' },
  { code: 74, label: 'استفاده نشده', state: 'unknown', operationalKind: 'workflow' },
  { code: 80, label: 'حذف شده', state: 'deleted', operationalKind: 'workflow' },
  { code: 81, label: 'بلاتکلیف', state: 'unknown', operationalKind: 'workflow' },
  { code: 82, label: 'مانند قبول', state: 'accepted', operationalKind: 'delivery' },
  { code: 83, label: 'تایید برگشتی', state: 'returning', operationalKind: 'delivery' },
  { code: 100, label: 'منتظر استعلام', state: 'unknown', operationalKind: 'workflow' },
  { code: 101, label: 'در حال تغییر وضعیت', state: 'unknown', operationalKind: 'workflow' },
  { code: 102, label: 'عودت داده شده', state: 'returned', operationalKind: 'delivery' },
  { code: 103, label: 'پیش ثبت سفارش', state: 'draft', operationalKind: 'workflow' },
]);
const byCode = new Map(tapinStatusDefinitions.map((definition) => [definition.code, definition]));
export const normalizeTapinStatus = (
  code: number,
  options: { label?: string; observedAt?: Date } = {},
): NormalizedShipmentStatus => {
  const definition = byCode.get(code);
  if (!definition)
    return {
      state: 'unknown',
      rawCode: code,
      ...(options.label ? { rawLabel: options.label } : {}),
      ...(options.observedAt ? { observedAt: options.observedAt } : {}),
    };
  return {
    state: definition.state,
    rawCode: code,
    rawLabel: options.label ?? definition.label,
    operationalKind: definition.operationalKind,
    ...(options.observedAt ? { observedAt: options.observedAt } : {}),
  };
};
export const statusHistoryDedupeKey = (
  status: Pick<NormalizedShipmentStatus, 'rawCode' | 'observedAt'>,
) => `${String(status.rawCode)}:${status.observedAt?.toISOString() ?? 'undated'}`;
