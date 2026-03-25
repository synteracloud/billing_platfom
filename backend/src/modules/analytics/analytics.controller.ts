import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AnalyticsReadOnlyGuard } from './analytics-readonly.guard';
import { AnalyticsService } from './analytics.service';

@Controller('api/v1/analytics')
@UseGuards(AnalyticsReadOnlyGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('cashflow')
  getCashflow(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getCashflow(request.tenant.id);
  }

  @Get('inflow-projection')
  getInflowProjection(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getInflowProjection(request.tenant.id);
  }

  @Get('outflow-projection')
  getOutflowProjection(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getOutflowProjection(request.tenant.id);
  }

  @Get('runway')
  getRunway(@Req() request: AuthenticatedRequest, @Query('horizon_days') horizonDays?: string) {
    const parsed = horizonDays ? Number(horizonDays) : undefined;
    return this.analyticsService.getRunway(request.tenant.id, parsed);
  }

  @Get('classify-transaction')
  classifyTransaction(
    @Query('amount_minor') amountMinor?: string,
    @Query('transaction_description') transactionDescription?: string,
    @Query('metadata_json') metadataJson?: string,
    @Query('ocr_text') ocrText?: string
  ) {
    let metadata: Record<string, unknown> | null = null;
    if (metadataJson) {
      try {
        const parsed = JSON.parse(metadataJson) as unknown;
        metadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      } catch {
        metadata = { raw_metadata: metadataJson };
      }
    }

    const parsedAmount = amountMinor != null && amountMinor !== '' ? Number(amountMinor) : null;
    return this.analyticsService.classifyTransaction({
      amount_minor: Number.isFinite(parsedAmount) ? parsedAmount : null,
      transaction_description: transactionDescription ?? null,
      metadata,
      ocr: ocrText ? { text: ocrText } : null
    });
  }
}
