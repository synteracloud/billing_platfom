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
import { CreateProductDto } from './dto/create-product.dto';
import { SuccessResponse } from './dto/response-envelope.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsService } from './products.service';

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  listProducts(@Req() req: AuthenticatedRequest): SuccessResponse<ProductEntity[]> {
    const products = this.productsService.listProducts(req.auth!.tenant_id);

    return {
      data: products,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProduct(@Req() req: AuthenticatedRequest, @Body() body: CreateProductDto): SuccessResponse<ProductEntity> {
    const product = this.productsService.createProduct(req.auth!.tenant_id, body);

    return {
      data: product,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getProduct(@Req() req: AuthenticatedRequest, @Param('id') id: string): SuccessResponse<ProductEntity> {
    const product = this.productsService.getProduct(req.auth!.tenant_id, id);

    return {
      data: product,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateProduct(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateProductDto
  ): SuccessResponse<ProductEntity> {
    const product = this.productsService.updateProduct(req.auth!.tenant_id, id, body);

    return {
      data: product,
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(@Req() req: AuthenticatedRequest, @Param('id') id: string): void {
    this.productsService.deleteProduct(req.auth!.tenant_id, id);
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
