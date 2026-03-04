import { Request } from 'express';

export type UserRole = 'admin' | 'member';

export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  auth?: JwtPayload;
}
