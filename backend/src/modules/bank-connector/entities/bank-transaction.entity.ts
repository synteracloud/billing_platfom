export interface BankTransaction {
  id: string;
  tenant_id: string;
  dedupe_key: string;
  external_id: string;
  account_id: string;
  posted_date: string;
  amount_minor: number;
  currency: string;
  direction: 'credit' | 'debit';
  description: string;
  counterparty_name: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InboundBankTransaction {
  external_id?: string | null;
  transaction_id?: string | null;
  account_id?: string | null;
  posted_at?: string | null;
  booked_at?: string | null;
  amount?: number | string | null;
  amount_minor?: number | null;
  currency?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}
