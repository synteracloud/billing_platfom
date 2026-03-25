import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [CustomersModule, InvoicesModule, PaymentsModule],
  controllers: [StatementsController],
  providers: [StatementsService],
  exports: [StatementsService]
})
export class StatementsModule {}
