import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CashflowService } from './cashflow.service';

@Controller('api/v1/reports/cashflow')
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Get()
  getCashflow(
    @Req() req: AuthenticatedRequest,
    @Query('period_from') periodFrom: string,
    @Query('period_to') periodTo: string
  ): {
    data: ReturnType<CashflowService['generate']>;
    meta: { request_id: string };
    error: null;
  } {
    if (!periodFrom || !periodTo) {
      throw new BadRequestException('period_from and period_to are required');
    }

    return {
      data: this.cashflowService.generate(req.auth!.tenant_id, periodFrom, periodTo),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
