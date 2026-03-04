export type UserRole = 'owner' | 'admin' | 'accountant' | 'viewer';
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}
