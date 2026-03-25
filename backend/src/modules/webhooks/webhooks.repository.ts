import { ConflictException } from '@nestjs/common';
import { WebhookIngestionEntity } from './entities/webhook-ingestion.entity';

export class WebhooksRepository {
  private readonly ingestions = new Map<string, WebhookIngestionEntity>();

  insert(ingestion: WebhookIngestionEntity): WebhookIngestionEntity {
    const key = this.toKey(ingestion.provider, ingestion.delivery_id);
    const existing = this.ingestions.get(key);
    if (existing) {
      throw new ConflictException('duplicate webhook delivery');
    }

    this.ingestions.set(key, ingestion);
    return ingestion;
  }

  find(provider: string, deliveryId: string): WebhookIngestionEntity | null {
    return this.ingestions.get(this.toKey(provider, deliveryId)) ?? null;
  }

  list(): WebhookIngestionEntity[] {
    return [...this.ingestions.values()];
  }

  private toKey(provider: string, deliveryId: string): string {
    return `${provider}::${deliveryId}`;
  }
}
