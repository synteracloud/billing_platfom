export interface LedgerReadQueryDto {
  tenant_id?: string;
  date_from?: string;
  date_to?: string;
  account?: string;
  account_code?: string;
  reference?: string;
  page?: string;
  page_size?: string;
}
