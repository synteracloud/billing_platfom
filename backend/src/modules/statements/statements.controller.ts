import { Controller, Get, Param } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { StatementsService } from './statements.service';

@Controller('api/v1/customers/:customerId/statement')
export class StatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @Get()
  getStatement(@Req() req: AuthenticatedRequest, @Param('customerId') customerId: string): {
    data: ReturnType<StatementsService['getCustomerStatement']>;
    meta: { request_id: string };
    error: null;
  } {
    return {
      data: this.statementsService.getCustomerStatement(req.auth!.tenant_id, customerId),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
