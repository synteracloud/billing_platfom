import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ApReadOnlyGuard } from './ap-readonly.guard';
import { ApService } from './ap.service';

@Controller('api/v1/ap')
@UseGuards(ApReadOnlyGuard)
export class ApController {
  constructor(private readonly apService: ApService) {}

  @Get('vendors/:vendorId/balance')
  getVendorBalance(@Req() request: AuthenticatedRequest, @Param('vendorId') vendorId: string) {
    return this.apService.getVendorBalance(request.tenant.id, vendorId);
  }

  @Get('vendors/:vendorId/bills')
  getBills(@Req() request: AuthenticatedRequest, @Param('vendorId') vendorId: string) {
    return this.apService.getBills(request.tenant.id, vendorId);
  }

  @Get('vendors/:vendorId/due-overdue')
  getDueOverdue(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Query('as_of_date') asOfDate?: string
  ) {
    const effectiveAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
    return this.apService.getDueOverdue(request.tenant.id, vendorId, effectiveAsOfDate);
  }
}
