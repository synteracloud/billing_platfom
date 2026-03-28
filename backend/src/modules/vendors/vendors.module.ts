import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, VendorsRepository],
  exports: [VendorsService, VendorsRepository]
})
export class VendorsModule {}
