import { Request } from 'express';

export type UserRole = 'owner' | 'admin' | 'accountant' | 'finance_manager' | 'staff' | 'read_only_auditor';

export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  auth?: JwtPayload;
  tenant?: { id: string };
  idempotency?: {
    key: string;
    scope: string;
  };
}
