import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  listPayments(@Req() req: AuthenticatedRequest): SuccessResponse<ReturnType<PaymentsService['listPayments']>> {
    return {
      data: this.paymentsService.listPayments(req.auth!.tenant_id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPayment(@Req() req: AuthenticatedRequest, @Body() body: CreatePaymentDto): SuccessResponse<unknown> {
    return {
      data: this.paymentsService.createPayment(req.auth!.tenant_id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getPayment(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.paymentsService.getPayment(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/allocate')
  allocatePayment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AllocatePaymentDto
  ): SuccessResponse<unknown> {
    return {
      data: this.paymentsService.allocatePayment(req.auth!.tenant_id, id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/void')
  voidPayment(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.paymentsService.voidPayment(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
