export interface LinkkitConfig {
  publishableKey: string;
  baseUrl?: string;
  /** Days after a click during which conversions are still attributed. Defaults to 90. */
  attributionWindow?: number;
}

export interface LinkkitContextValue {
  clickId: string | null;
  /** Resolved destination URL from the most recent deep link open. Set automatically; use this to navigate the user. */
  destinationUrl: string | null;
  trackOpen: () => Promise<{ url: string | null }>;
  trackLead: (params: TrackLeadParams) => Promise<void>;
  trackSale: (params: TrackSaleParams) => Promise<void>;
}

export interface OpenPayload {
  publishable_key: string;
  lkclid: string;
}

export interface OpenResponse {
  url?: string;
}

export interface TrackLeadParams {
  eventName?: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  customerAvatar?: string;
  metadata?: Record<string, unknown>;
}

export interface TrackSaleParams {
  eventName?: string;
  amount: number;
  currency?: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  customerAvatar?: string;
  paymentProcessor?: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversionPayload {
  publishable_key: string;
  lkclid: string;
  event_name?: string;
  amount?: number;
  currency?: string;
  customer_external_id: string;
  customer_email?: string;
  customer_name?: string;
  customer_avatar?: string;
  payment_processor?: string;
  invoice_id?: string;
  metadata?: Record<string, unknown>;
}
