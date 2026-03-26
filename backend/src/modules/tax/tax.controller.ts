import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { TaxReadOnlyGuard } from './tax-readonly.guard';
import { TaxService } from './tax.service';

@Controller('api/v1/reports/tax')
@UseGuards(TaxReadOnlyGuard)
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('payable-summary')
  getPayableSummary(
    @Req() req: AuthenticatedRequest,
    @Query('period_from') periodFrom: string,
    @Query('period_to') periodTo: string
  ): {
    data: ReturnType<TaxService['getTaxPayableSummary']>;
    meta: { request_id: string };
    error: null;
  } {
    this.validateWindow(periodFrom, periodTo);

    return {
      data: this.taxService.getTaxPayableSummary(req.auth!.tenant_id, periodFrom, periodTo),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('collected-vs-paid')
  getCollectedVsPaid(
    @Req() req: AuthenticatedRequest,
    @Query('period_from') periodFrom: string,
    @Query('period_to') periodTo: string
  ): {
    data: ReturnType<TaxService['getTaxCollectedVsPaid']>;
    meta: { request_id: string };
    error: null;
  } {
    this.validateWindow(periodFrom, periodTo);

    return {
      data: this.taxService.getTaxCollectedVsPaid(req.auth!.tenant_id, periodFrom, periodTo),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('period-export')
  getPeriodExport(
    @Req() req: AuthenticatedRequest,
    @Query('period_from') periodFrom: string,
    @Query('period_to') periodTo: string
  ): {
    data: ReturnType<TaxService['getPeriodTaxReportExportModel']>;
    meta: { request_id: string };
    error: null;
  } {
    this.validateWindow(periodFrom, periodTo);

    return {
      data: this.taxService.getPeriodTaxReportExportModel(req.auth!.tenant_id, periodFrom, periodTo),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  private validateWindow(periodFrom: string, periodTo: string): void {
    if (!periodFrom || !periodTo) {
      throw new BadRequestException('period_from and period_to are required');
    }
  }
}
