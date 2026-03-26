import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../auth/permissions';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingPeriodsService } from './accounting-periods.service';

interface UpdatePeriodStatusRequest {
  period_key: string;
}

@Controller('api/v1/accounting')
export class AccountingPeriodsController {
  constructor(private readonly accountingPeriodsService: AccountingPeriodsService) {}

  @Post('periods/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CLOSE_PERIODS)
  closePeriod(@Req() req: AuthenticatedRequest, @Body() body: UpdatePeriodStatusRequest) {
    return {
      data: this.accountingPeriodsService.closePeriod(req.auth!.tenant_id, body.period_key, req.auth!.user_id),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Post('books/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.REOPEN_BOOKS)
  reopenBooks(@Req() req: AuthenticatedRequest, @Body() body: UpdatePeriodStatusRequest) {
    return {
      data: this.accountingPeriodsService.reopenBooks(req.auth!.tenant_id, body.period_key, req.auth!.user_id),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
