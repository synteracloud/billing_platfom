import { Module } from '@nestjs/common';
import { UsersModule } from '../users/module';
import { AuthController } from './controller';
import { AuthRepository } from './repository';
import { AuthService } from './service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
  exports: [AuthService]
})
export class AuthModule {}
