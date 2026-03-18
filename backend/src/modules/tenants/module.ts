import { Module } from '@nestjs/common';
import { ChartOfAccountsModule } from '../accounting/chart-of-accounts.module';
import { TenantsController } from './controller';
import { TenantsRepository } from './repository';
import { TenantsService } from './service';

@Module({
  imports: [ChartOfAccountsModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService, TenantsRepository]
})
export class TenantsModule {}
