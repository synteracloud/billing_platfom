import { createHash, randomUUID } from 'crypto';

export interface CreateWebhookIngestionInput {
  provider: string;
  delivery_id: string;
  payload_raw: string;
  signature: string;
  payload_hash: string;
}

export class WebhookIngestionEntity {
  id: string;
  provider: string;
  delivery_id: string;
  payload_raw: string;
  signature: string;
  payload_hash: string;
  received_at: string;

  static create(input: CreateWebhookIngestionInput): WebhookIngestionEntity {
    const entity = new WebhookIngestionEntity();
    entity.id = randomUUID();
    entity.provider = input.provider;
    entity.delivery_id = input.delivery_id;
    entity.payload_raw = input.payload_raw;
    entity.signature = input.signature;
    entity.payload_hash = input.payload_hash;
    entity.received_at = new Date().toISOString();
    return entity;
  }

  static hashPayload(payloadRaw: string): string {
    return createHash('sha256').update(payloadRaw, 'utf8').digest('hex');
  }
}
