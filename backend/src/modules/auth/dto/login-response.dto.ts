import { UserRole } from '../../../common/interfaces/authenticated-request.interface';

export interface LoginResponseDto {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}
