import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ArService } from './ar.service';

@Controller('api/v1/ar')
export class ArController {
  constructor(private readonly arService: ArService) {}

  @Get('customers/:customerId/financial-state')
  getCustomerFinancialState(@Req() request: AuthenticatedRequest, @Param('customerId') customerId: string) {
    return this.arService.getCustomerFinancialState(request.tenant.id, customerId);
  }
}
