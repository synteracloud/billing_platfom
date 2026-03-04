import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity, ProductType } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  listProducts(tenantId: string): ProductEntity[] {
    return this.productsRepository.listByTenant(tenantId);
  }

  createProduct(tenantId: string, data: CreateProductDto): ProductEntity {
    this.validateName(data.name);
    this.validateType(data.type);
    this.validateUnitPriceMinor(data.unit_price_minor);
    this.validateCurrency(data.currency);

    return this.productsRepository.create({
      tenant_id: tenantId,
      name: data.name.trim(),
      description: data.description ?? null,
      type: data.type,
      unit_price_minor: data.unit_price_minor,
      currency: data.currency.toUpperCase(),
      tax_category: data.tax_category ?? null,
      active: data.active ?? true,
      metadata: data.metadata ?? null
    });
  }

  getProduct(tenantId: string, productId: string): ProductEntity {
    const product = this.productsRepository.findById(tenantId, productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  updateProduct(tenantId: string, productId: string, data: UpdateProductDto): ProductEntity {
    if (data.name !== undefined) {
      this.validateName(data.name);
    }

    if (data.type !== undefined) {
      this.validateType(data.type);
    }

    if (data.unit_price_minor !== undefined) {
      this.validateUnitPriceMinor(data.unit_price_minor);
    }

    if (data.currency !== undefined) {
      this.validateCurrency(data.currency);
    }

    const updated = this.productsRepository.update(tenantId, productId, {
      ...data,
      name: data.name?.trim(),
      currency: data.currency?.toUpperCase()
    });

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated;
  }

  deleteProduct(tenantId: string, productId: string): void {
    const deleted = this.productsRepository.softDelete(tenantId, productId);
    if (!deleted) {
      throw new NotFoundException('Product not found');
    }
  }

  private validateName(name: string | undefined): void {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
  }

  private validateType(type: ProductType): void {
    if (type !== 'product' && type !== 'service') {
      throw new BadRequestException('type must be one of: product, service');
    }
  }

  private validateUnitPriceMinor(unitPriceMinor: number): void {
    if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
      throw new BadRequestException('unit_price_minor must be an integer >= 0');
    }
  }

  private validateCurrency(currency: string): void {
    const normalizedCurrency = currency?.toUpperCase();
    if (!normalizedCurrency || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new BadRequestException('currency must be a valid ISO-4217 code');
    }

    const supportedValuesOf = Intl as Intl & {
      supportedValuesOf?: (key: string) => string[];
    };

    if (typeof supportedValuesOf.supportedValuesOf === 'function') {
      const currencies = new Set(supportedValuesOf.supportedValuesOf('currency').map((value) => value.toUpperCase()));
      if (!currencies.has(normalizedCurrency)) {
        throw new BadRequestException('currency must be a valid ISO-4217 code');
      }
    }
  }
}
