import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookIngestionEntity } from './entities/webhook-ingestion.entity';
import { WebhooksRepository } from './webhooks.repository';

export interface IngestWebhookInput {
  provider: string;
  delivery_id: string;
  payload_raw: string;
  signature: string;
  timestamp: string;
}

export interface WebhookIngestionResult {
  status: 'stored' | 'duplicate';
  ingestion: WebhookIngestionEntity;
}

@Injectable()
export class WebhooksService {
  constructor(private readonly webhooksRepository: WebhooksRepository) {}

  ingest(input: IngestWebhookInput): WebhookIngestionResult {
    const provider = input.provider?.trim();
    const deliveryId = input.delivery_id?.trim();
    const payloadRaw = input.payload_raw;
    const signature = input.signature?.trim();
    const timestamp = input.timestamp?.trim();

    if (!provider || !deliveryId || !payloadRaw || !signature || !timestamp) {
      throw new BadRequestException('provider, delivery_id, payload_raw, signature, and timestamp are required');
    }

    this.validateSignature(provider, payloadRaw, timestamp, signature);

    const existing = this.webhooksRepository.find(provider, deliveryId);
    if (existing) {
      return {
        status: 'duplicate',
        ingestion: existing
      };
    }

    const ingestion = WebhookIngestionEntity.create({
      provider,
      delivery_id: deliveryId,
      payload_raw: payloadRaw,
      signature,
      payload_hash: WebhookIngestionEntity.hashPayload(payloadRaw)
    });

    this.webhooksRepository.insert(ingestion);

    return {
      status: 'stored',
      ingestion
    };
  }

  private validateSignature(provider: string, payloadRaw: string, timestamp: string, providedSignature: string): void {
    const secret = this.resolveSecret(provider);
    const signedPayload = `${timestamp}.${payloadRaw}`;
    const expectedHex = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const providedHex = this.normalizeSignature(providedSignature);

    const expected = Buffer.from(expectedHex, 'hex');
    const provided = Buffer.from(providedHex, 'hex');

    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('invalid webhook signature');
    }
  }

  private normalizeSignature(signature: string): string {
    const normalized = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length !== 64) {
      throw new UnauthorizedException('invalid webhook signature');
    }

    return normalized.toLowerCase();
  }

  private resolveSecret(provider: string): string {
    const envKey = `WEBHOOK_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    return process.env[envKey] ?? process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret';
  }
}
