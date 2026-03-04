import { UserRole } from '../entity/user.entity';

export interface CreateUserDto {
  email: string;
  password: string;
  role: UserRole;
}
