import { Module } from '@nestjs/common';
import { UsersController } from './controller';
import { UsersRepository } from './repository';
import { UsersService } from './service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository]
})
export class UsersModule {}
