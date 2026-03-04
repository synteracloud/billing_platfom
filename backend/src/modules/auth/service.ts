import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../../common/interfaces/authenticated-request.interface';
import { UsersService } from '../users/service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

@Injectable()
export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET ?? 'dev-secret';
  private readonly expiresInSeconds = 60 * 60;

  constructor(private readonly usersService: UsersService) {}

  async login(data: LoginDto): Promise<LoginResponseDto> {
    const user = this.usersService.findByActiveEmail(data.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(data.password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      user_id: user.id,
      tenant_id: user.tenant_id,
      role: user.role
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, { expiresIn: this.expiresInSeconds });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  }

  validateToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
