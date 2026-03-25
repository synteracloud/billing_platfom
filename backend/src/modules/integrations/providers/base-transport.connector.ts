import { ConnectorInterface } from '../interfaces/connector.interface';
import {
  ConnectorAuthInput,
  ConnectorAuthResult,
  ConnectorContext,
  ConnectorPullInput,
  ConnectorPullResult,
  ConnectorPushInput,
  ConnectorPushResult,
  ConnectorWebhookInput,
  ConnectorWebhookResult,
  ConnectorDirection,
  ConnectorTransportRecord
} from '../interfaces/connector.types';
import { ProviderTransport } from './provider-transport.interface';

export abstract class BaseTransportConnector implements ConnectorInterface {
  protected constructor(private readonly transport: ProviderTransport) {}

  async authenticate(_context: ConnectorContext, input: ConnectorAuthInput): Promise<ConnectorAuthResult> {
    return this.transport.authenticate(input);
  }

  async pull(context: ConnectorContext, input: ConnectorPullInput): Promise<ConnectorPullResult> {
    const response = await this.transport.pull(input);

    return {
      normalization: this.createNormalizationTrigger(context, 'inbound', response.records, response.cursor, response.metadata),
      nextCursor: response.cursor,
      hasMore: response.hasMore
    };
  }

  async push(context: ConnectorContext, input: ConnectorPushInput): Promise<ConnectorPushResult> {
    const response = await this.transport.push(input);

    return {
      normalization: this.createNormalizationTrigger(context, 'outbound', response.records, undefined, response.metadata),
      acceptedCount: response.acceptedCount
    };
  }

  async handleWebhook(context: ConnectorContext, input: ConnectorWebhookInput): Promise<ConnectorWebhookResult> {
    const response = await this.transport.handleWebhook(input);

    return {
      normalization: this.createNormalizationTrigger(context, 'inbound', response.records, undefined, response.metadata),
      acknowledged: response.acknowledged
    };
  }

  private createNormalizationTrigger(
    context: ConnectorContext,
    direction: ConnectorDirection,
    records: ConnectorTransportRecord[],
    cursor?: string,
    metadata?: Record<string, unknown>
  ) {
    return {
      trigger: 'normalization.requested.v1' as const,
      direction,
      records,
      cursor,
      receivedAt: new Date().toISOString(),
      metadata: {
        ...metadata,
        tenantId: context.tenantId,
        connectorId: context.connectorId,
        provider: context.provider
      }
    };
  }
}
