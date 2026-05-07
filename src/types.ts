export interface LinkkitConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface LinkkitContextValue {
  clickId: string | null;
  trackLead: (params: TrackLeadParams) => Promise<void>;
  trackSale: (params: TrackSaleParams) => Promise<void>;
}

export interface TrackLeadParams {
  eventName?: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
}

export interface TrackSaleParams {
  eventName?: string;
  amount: number;
  currency?: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  paymentProcessor?: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversionPayload {
  lkclid: string;
  event_name?: string;
  type: 'lead' | 'sale';
  amount?: number;
  currency?: string;
  customer_external_id: string;
  customer_email?: string;
  customer_name?: string;
  payment_processor?: string;
  invoice_id?: string;
  metadata?: Record<string, unknown>;
}
