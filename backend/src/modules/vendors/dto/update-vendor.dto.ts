import { VendorStatus } from '../entities/vendor.entity';

export interface UpdateVendorDto {
  name?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  currency_code?: string;
  status?: VendorStatus;
  metadata?: Record<string, unknown> | null;
}
