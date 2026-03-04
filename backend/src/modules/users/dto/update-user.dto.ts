import { UserRole, UserStatus } from '../entity/user.entity';

export interface UpdateUserDto {
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
}
