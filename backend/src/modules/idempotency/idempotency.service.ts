import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { IdempotencyKeyEntity, StoredHttpResponse } from './entities/idempotency-key.entity';
import { IdempotencyRepository } from './idempotency.repository';

type BeginResult =
  | { state: 'started'; record: IdempotencyKeyEntity }
  | { state: 'completed'; record: IdempotencyKeyEntity }
  | { state: 'in_progress'; record: IdempotencyKeyEntity };

@Injectable()
export class IdempotencyService {
  private readonly waitersByCompositeKey = new Map<string, Array<(record: IdempotencyKeyEntity | null) => void>>();

  constructor(private readonly idempotencyRepository: IdempotencyRepository) {}

  begin(scope: string, key: string): BeginResult {
    const existing = this.idempotencyRepository.find(scope, key);
    if (existing) {
      if (existing.status === 'completed') {
        return { state: 'completed', record: existing };
      }

      return { state: 'in_progress', record: existing };
    }

    const created = this.idempotencyRepository.createPending(scope, key);
    return { state: 'started', record: created };
  }

  async waitForCompletion(scope: string, key: string): Promise<IdempotencyKeyEntity | null> {
    const existing = this.idempotencyRepository.find(scope, key);
    if (!existing) {
      return null;
    }

    if (existing.status === 'completed') {
      return existing;
    }

    return new Promise<IdempotencyKeyEntity | null>((resolve) => {
      const composite = this.toCompositeKey(scope, key);
      const waiters = this.waitersByCompositeKey.get(composite) ?? [];
      waiters.push(resolve);
      this.waitersByCompositeKey.set(composite, waiters);
    });
  }

  complete(scope: string, key: string, response: StoredHttpResponse): IdempotencyKeyEntity {
    const responseHash = this.hashPayload(response.body);
    const completed = this.idempotencyRepository.markCompleted(scope, key, responseHash, response);
    this.resolveWaiters(scope, key, completed);
    return completed;
  }

  fail(scope: string, key: string): void {
    this.idempotencyRepository.delete(scope, key);
    this.resolveWaiters(scope, key, null);
  }

  hashPayload(payload: unknown): string {
    const serialized = this.stableStringify(payload);
    return createHash('sha256').update(serialized).digest('hex');
  }

  private resolveWaiters(scope: string, key: string, record: IdempotencyKeyEntity | null): void {
    const composite = this.toCompositeKey(scope, key);
    const waiters = this.waitersByCompositeKey.get(composite) ?? [];
    for (const resolve of waiters) {
      resolve(record);
    }

    this.waitersByCompositeKey.delete(composite);
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return JSON.stringify(value);
    }

    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`);

    return `{${entries.join(',')}}`;
  }

  private toCompositeKey(scope: string, key: string): string {
    return `${scope}::${key}`;
  }
}
