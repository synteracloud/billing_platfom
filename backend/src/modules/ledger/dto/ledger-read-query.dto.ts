export interface LedgerReadQueryDto {
  date_from?: string;
  date_to?: string;
  account_code?: string;
  reference?: string;
  cursor?: string;
  limit?: number;
}
