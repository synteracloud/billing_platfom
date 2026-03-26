export type TaxRegime = 'sales_tax' | 'vat' | 'gst';

export interface TaxRateEntity {
  id: string;
  tenant_id: string;
  tax_code: string;
  regime: TaxRegime;
  jurisdiction: string;
  rate_basis_points: number;
  inclusive: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxLineCalculationInput {
  line_id?: string;
  amount_minor: number;
  quantity?: number;
  tax_code?: string | null;
  tax_rate_basis_points?: number | null;
  tax_inclusive?: boolean;
}

export interface TaxLineCalculationResult {
  line_id: string;
  tax_code: string | null;
  rate_basis_points: number;
  inclusive: boolean;
  taxable_base_minor: number;
  tax_minor: number;
  total_minor: number;
}

export interface TaxDocumentCalculationResult {
  jurisdiction: string;
  currency_code: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  lines: TaxLineCalculationResult[];
  by_tax_code: Array<{
    tax_code: string;
    rate_basis_points: number;
    tax_minor: number;
    taxable_base_minor: number;
  }>;
}

export interface TaxSummaryReport {
  tax_collected_minor: number;
  tax_paid_minor: number;
  net_tax_liability_minor: number;
  by_jurisdiction: Array<{
    jurisdiction: string;
    tax_collected_minor: number;
    tax_paid_minor: number;
    net_tax_liability_minor: number;
  }>;
}
