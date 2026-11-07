import type { Money } from './money.js';
import type { ShipmentState } from './domain.js';

export type ShippingOrderLine = Readonly<{
  localProductId: string;
  title: string;
  count: number;
  unitValue: Money;
  discount?: Money;
  weightGrams: number;
}>;

export type ShippingOrder = Readonly<{
  orderId: string;
  tenantId: string;
  shopId: string;
  declaredValue: Money;
  lines: readonly ShippingOrderLine[];
}>;

export type ShippingOrderSource = {
  getShippingOrder(orderId: string): Promise<ShippingOrder>;
};

export type ParcelCreatedEvent = Readonly<{
  tenantId: string;
  localParcelId: string;
  providerOrderId?: string;
  manualOrderId: string;
}>;
export type TrackingChangedEvent = Readonly<{
  tenantId: string;
  localParcelId: string;
  previousState: ShipmentState;
  state: ShipmentState;
  rawCode: number | string;
}>;
export type ParcelTerminalEvent = Readonly<{
  tenantId: string;
  localParcelId: string;
  state: 'delivered' | 'returned' | 'damaged';
}>;

export type TapinEvents = {
  onParcelCreated?(event: ParcelCreatedEvent): Promise<void>;
  onTrackingChanged?(event: TrackingChangedEvent): Promise<void>;
  onDelivered?(event: ParcelTerminalEvent & { state: 'delivered' }): Promise<void>;
  onReturned?(event: ParcelTerminalEvent & { state: 'returned' }): Promise<void>;
  onDamaged?(event: ParcelTerminalEvent & { state: 'damaged' }): Promise<void>;
};
