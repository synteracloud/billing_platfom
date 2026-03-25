import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ArAgingQueryDto } from './dto/ar-aging-query.dto';
import { SuccessResponse } from './dto/ar-response-envelope.dto';
import { ArStatementQueryDto } from './dto/ar-statement-query.dto';
import { ArReadOnlyGuard } from './ar-readonly.guard';
import { ArService } from './ar.service';

@Controller('api/v1/ar')
@UseGuards(ArReadOnlyGuard)
export class ArController {
  constructor(private readonly arService: ArService) {}

  @Get('customers/:customerId/balance')
  getCustomerBalance(
    @Req() req: AuthenticatedRequest,
    @Param('customerId') customerId: string
  ): SuccessResponse<ReturnType<ArService['getCustomerBalance']>> {
    return {
      data: this.arService.getCustomerBalance(req.auth!.tenant_id, customerId),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('customers/:customerId/aging')
  getAging(
    @Req() req: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query() query: ArAgingQueryDto
  ): SuccessResponse<ReturnType<ArService['getAging']>> {
    return {
      data: this.arService.getAging(req.auth!.tenant_id, customerId, query.as_of),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('customers/:customerId/statements')
  getStatements(
    @Req() req: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query() query: ArStatementQueryDto
  ): SuccessResponse<ReturnType<ArService['getStatement']>> {
    return {
      data: this.arService.getStatement(req.auth!.tenant_id, customerId, query),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
