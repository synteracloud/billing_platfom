export type UserRole = 'admin' | 'member';
export type UserStatus = 'active' | 'deactivated';

export interface UserEntity {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
