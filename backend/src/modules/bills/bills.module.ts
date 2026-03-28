import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { BillsController } from './bills.controller';
import { BillsRepository } from './bills.repository';
import { BillsService } from './bills.service';

@Module({
  imports: [VendorsModule],
  controllers: [BillsController],
  providers: [BillsService, BillsRepository],
  exports: [BillsService, BillsRepository]
})
export class BillsModule {}
