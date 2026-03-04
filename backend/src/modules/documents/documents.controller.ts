import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { DocumentsService } from './documents.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents')
  listDocuments(@Req() req: AuthenticatedRequest): SuccessResponse<unknown> {
    return {
      data: this.documentsService.listDocuments(req.auth!.tenant_id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get('documents/:id')
  getDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<unknown> {
    return {
      data: this.documentsService.getDocument(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get('invoices/:id/pdf')
  async getInvoicePdf(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<SuccessResponse<unknown>> {
    return {
      data: await this.documentsService.getInvoicePdf(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post('invoices/:id/send')
  async sendInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendInvoiceDto
  ): Promise<SuccessResponse<unknown>> {
    return {
      data: await this.documentsService.sendInvoice(req.auth!.tenant_id, id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
