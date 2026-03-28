import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { BillEntity } from './entities/bill.entity';

interface SuccessResponse<T> {
  data: T;
  meta: { request_id: string };
  error: null;
}

@Controller('api/v1/bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get()
  listBills(
    @Req() req: AuthenticatedRequest,
    @Query('vendor_id') vendorId?: string
  ): SuccessResponse<BillEntity[]> {
    return {
      data: this.billsService.listBills(req.auth!.tenant_id, vendorId),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBill(@Req() req: AuthenticatedRequest, @Body() body: CreateBillDto): SuccessResponse<BillEntity> {
    return {
      data: this.billsService.createBill(req.auth!.tenant_id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getBill(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<BillEntity> {
    return {
      data: this.billsService.getBill(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateBill(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateBillDto
  ): SuccessResponse<BillEntity> {
    return {
      data: this.billsService.updateBill(req.auth!.tenant_id, id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBill(@Req() req: AuthenticatedRequest, @Param('id') id: string): void {
    this.billsService.deleteBill(req.auth!.tenant_id, id);
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
