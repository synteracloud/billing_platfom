import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post
} from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AddLineDto } from './dto/add-line.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  listInvoices(@Req() req: AuthenticatedRequest): SuccessResponse<ReturnType<InvoicesService['listInvoices']>> {
    return {
      data: this.invoicesService.listInvoices(req.auth!.tenant_id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createInvoice(@Req() req: AuthenticatedRequest, @Body() body: CreateInvoiceDto): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.createInvoice(req.auth!.tenant_id, body, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getInvoice(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.getInvoice(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateInvoiceDto
  ): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.updateInvoice(req.auth!.tenant_id, id, body, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/issue')
  issueInvoice(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.issueInvoice(req.auth!.tenant_id, id, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/void')
  voidInvoice(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.voidInvoice(req.auth!.tenant_id, id, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/lines')
  addLine(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddLineDto
  ): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.addLine(req.auth!.tenant_id, id, body, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Delete(':id/lines/:line_id')
  @HttpCode(HttpStatus.OK)
  deleteLine(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('line_id') lineId: string
  ): SuccessResponse<unknown> {
    return {
      data: this.invoicesService.removeLine(req.auth!.tenant_id, id, lineId, req.idempotency?.key),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
