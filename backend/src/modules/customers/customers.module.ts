import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomerBalanceEventsConsumer } from './customer-balance-events.consumer';
import { CustomerBalanceRepository } from './customer-balance.repository';
import { CustomerBalanceService } from './customer-balance.service';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';
import { EventQueueModule } from '../events/queue/event-queue.module';

@Module({
  imports: [EventQueueModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomersRepository,
    CustomerBalanceRepository,
    CustomerBalanceService,
    CustomerBalanceEventsConsumer
  ],
  exports: [CustomersService, CustomersRepository, CustomerBalanceService, CustomerBalanceRepository]
})
export class CustomersModule {}
