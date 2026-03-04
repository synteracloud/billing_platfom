import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { SuccessResponse } from './dto/response-envelope.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerEntity } from './entities/customer.entity';
import { CustomersService } from './customers.service';

@Controller('api/v1/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  listCustomers(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListCustomersQueryDto
  ): SuccessResponse<CustomerEntity[]> {
    const result = this.customersService.listCustomers(req.auth!.tenant_id, query);

    return {
      data: result.items,
      meta: {
        request_id: this.getRequestId(),
        cursor: {
          next: result.cursor.next,
          prev: result.cursor.prev,
          has_more: result.cursor.has_more
        }
      },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createCustomer(@Req() req: AuthenticatedRequest, @Body() body: CreateCustomerDto): SuccessResponse<CustomerEntity> {
    const customer = this.customersService.createCustomer(req.auth!.tenant_id, body);

    return {
      data: customer,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getCustomer(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<CustomerEntity> {
    const customer = this.customersService.getCustomer(req.auth!.tenant_id, id);

    return {
      data: customer,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateCustomer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto
  ): SuccessResponse<CustomerEntity> {
    const customer = this.customersService.updateCustomer(req.auth!.tenant_id, id, body);

    return {
      data: customer,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCustomer(@Req() req: AuthenticatedRequest, @Param('id') id: string): void {
    this.customersService.deleteCustomer(req.auth!.tenant_id, id);
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
