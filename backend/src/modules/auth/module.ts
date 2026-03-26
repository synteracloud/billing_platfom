import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/module';
import { AuthController } from './controller';
import { AuthRepository } from './repository';
import { PermissionsGuard } from './permissions.guard';
import { AuthService } from './service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
