import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AnalyticsReadOnlyGuard } from './analytics-readonly.guard';
import { AnalyticsService } from './analytics.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('api/v1/analytics')
@UseGuards(AnalyticsReadOnlyGuard)
@RequirePermissions(PERMISSIONS.VIEW_REPORTS)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('cashflow')
  getCashflow(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getCashflow(request.tenant.id);
  }

  @Get('time-series')
  getTimeSeries(@Req() request: AuthenticatedRequest, @Query('bucket') bucket?: 'daily' | 'weekly' | 'monthly') {
    const normalizedBucket = bucket === 'weekly' || bucket === 'monthly' ? bucket : 'daily';
    return this.analyticsService.getTimeSeries(request.tenant.id, normalizedBucket);
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

  @Get('tax-summary')
  getTaxSummary(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getTaxSummary(request.tenant.id);
  }

  @Get('anomalies')
  getAnomalies(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.getAnomalies(request.tenant.id);
  }
}
