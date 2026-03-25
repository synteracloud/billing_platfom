import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { ArController } from './ar.controller';
import { ArReadOnlyGuard } from './ar-readonly.guard';
import { ArService } from './ar.service';

@Module({
  imports: [CustomersModule, InvoicesModule, PaymentsModule],
  controllers: [ArController],
  providers: [ArService, ArReadOnlyGuard],
  exports: [ArService]
})
export class ArModule {}
