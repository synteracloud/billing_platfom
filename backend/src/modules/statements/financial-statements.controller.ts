import { Controller, Get, Query } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('api/v1/reports/financial-statements')
export class FinancialStatementsController {
  constructor(private readonly financialStatementsService: FinancialStatementsService) {}

  @Get()
  getFinancialStatements(
    @Req() req: AuthenticatedRequest,
    @Query('period_from') periodFrom: string,
    @Query('period_to') periodTo: string
  ): {
    data: ReturnType<FinancialStatementsService['generate']>;
    meta: { request_id: string };
    error: null;
  } {
    return {
      data: this.financialStatementsService.generate(req.auth!.tenant_id, periodFrom, periodTo),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
