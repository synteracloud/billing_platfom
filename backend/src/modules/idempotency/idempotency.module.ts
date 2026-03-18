import { Module } from '@nestjs/common';
import { EventConsumerIdempotencyService } from './event-consumer-idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

@Module({
  providers: [IdempotencyRepository, IdempotencyService, EventConsumerIdempotencyService],
  exports: [IdempotencyService, EventConsumerIdempotencyService]
})
export class IdempotencyModule {}
