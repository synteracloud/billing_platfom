import { Module } from '@nestjs/common';
import { TenantsController } from './controller';
import { TenantsRepository } from './repository';
import { TenantsService } from './service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService, TenantsRepository]
})
export class TenantsModule {}
