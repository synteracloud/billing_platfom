import {
  ConnectorAuthInput,
  ConnectorAuthResult,
  ConnectorPullInput,
  ConnectorPushInput,
  ConnectorWebhookInput,
  ConnectorTransportRecord
} from '../interfaces/connector.types';

export interface ProviderTransport {
  authenticate(input: ConnectorAuthInput): Promise<ConnectorAuthResult>;
  pull(input: ConnectorPullInput): Promise<{
    records: ConnectorTransportRecord[];
    cursor?: string;
    hasMore?: boolean;
    metadata?: Record<string, unknown>;
  }>;
  push(input: ConnectorPushInput): Promise<{
    records: ConnectorTransportRecord[];
    acceptedCount: number;
    metadata?: Record<string, unknown>;
  }>;
  handleWebhook(input: ConnectorWebhookInput): Promise<{
    records: ConnectorTransportRecord[];
    acknowledged: boolean;
    metadata?: Record<string, unknown>;
  }>;
}
