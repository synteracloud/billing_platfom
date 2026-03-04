import { Controller, Get } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { DashboardService } from './dashboard.service';

interface SuccessResponse<T> {
  data: T;
  meta: { request_id: string };
  error: null;
}

@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  getMetrics(@Req() req: AuthenticatedRequest): SuccessResponse<ReturnType<DashboardService['getMetrics']>> {
    return {
      data: this.dashboardService.getMetrics(req.auth!.tenant_id),
      meta: { request_id: randomUUID() },
      error: null,
    };
  }
}
