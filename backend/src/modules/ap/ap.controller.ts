import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ApService } from './ap.service';

@Controller('api/v1/ap')
export class ApController {
  constructor(private readonly apService: ApService) {}

  @Get('vendors/:vendorId/payable-state')
  getVendorPayableState(@Req() request: AuthenticatedRequest, @Param('vendorId') vendorId: string) {
    return this.apService.getVendorPayableState(request.tenant.id, vendorId);
  }
}
