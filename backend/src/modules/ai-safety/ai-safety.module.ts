import { Module } from '@nestjs/common';
import { AiSafetyService } from './ai-safety.service';

@Module({
  providers: [AiSafetyService],
  exports: [AiSafetyService]
})
export class AiSafetyModule {}
