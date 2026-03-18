import { ConflictException, Injectable } from '@nestjs/common';
import { IdempotencyKeyEntity, StoredHttpResponse } from './entities/idempotency-key.entity';

@Injectable()
export class IdempotencyRepository {
  private readonly keysByScopeAndKey = new Map<string, IdempotencyKeyEntity>();

  find(scope: string, key: string): IdempotencyKeyEntity | undefined {
    return this.keysByScopeAndKey.get(this.toCompositeKey(scope, key));
  }

  createPending(scope: string, key: string): IdempotencyKeyEntity {
    const composite = this.toCompositeKey(scope, key);
    if (this.keysByScopeAndKey.has(composite)) {
      throw new ConflictException('Unique constraint violation for (scope, key)');
    }

    const entity: IdempotencyKeyEntity = {
      key,
      scope,
      status: 'in_progress',
      response_hash: null,
      created_at: new Date().toISOString(),
      response: null
    };

    this.keysByScopeAndKey.set(composite, entity);
    return entity;
  }

  markCompleted(scope: string, key: string, responseHash: string, response: StoredHttpResponse): IdempotencyKeyEntity {
    const entity = this.requireEntity(scope, key);
    entity.status = 'completed';
    entity.response_hash = responseHash;
    entity.response = response;
    this.keysByScopeAndKey.set(this.toCompositeKey(scope, key), entity);
    return entity;
  }

  delete(scope: string, key: string): void {
    this.keysByScopeAndKey.delete(this.toCompositeKey(scope, key));
  }

  private requireEntity(scope: string, key: string): IdempotencyKeyEntity {
    const entity = this.find(scope, key);
    if (!entity) {
      throw new ConflictException('Idempotency key does not exist');
    }

    return entity;
  }

  private toCompositeKey(scope: string, key: string): string {
    return `${scope}::${key}`;
  }
}
