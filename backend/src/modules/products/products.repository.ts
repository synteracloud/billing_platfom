import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProductEntity } from './entities/product.entity';

@Injectable()
export class ProductsRepository {
  private readonly products = new Map<string, ProductEntity>();

  create(
    product: Omit<ProductEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
  ): ProductEntity {
    const now = new Date().toISOString();
    const created: ProductEntity = {
      ...product,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    this.products.set(created.id, created);
    return created;
  }

  findById(tenantId: string, productId: string): ProductEntity | undefined {
    const product = this.products.get(productId);
    if (!product || product.tenant_id !== tenantId || product.deleted_at !== null) {
      return undefined;
    }

    return product;
  }

  listByTenant(tenantId: string): ProductEntity[] {
    return [...this.products.values()]
      .filter((product) => product.tenant_id === tenantId && product.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  update(
    tenantId: string,
    productId: string,
    patch: Partial<Omit<ProductEntity, 'id' | 'tenant_id' | 'created_at' | 'deleted_at'>>
  ): ProductEntity | undefined {
    const existing = this.findById(tenantId, productId);
    if (!existing) {
      return undefined;
    }

    const updated: ProductEntity = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.products.set(productId, updated);
    return updated;
  }

  softDelete(tenantId: string, productId: string): boolean {
    const existing = this.findById(tenantId, productId);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    this.products.set(productId, {
      ...existing,
      updated_at: now,
      deleted_at: now
    });

    return true;
  }
}
