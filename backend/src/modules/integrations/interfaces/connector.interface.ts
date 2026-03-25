import {
  ConnectorAuthInput,
  ConnectorAuthResult,
  ConnectorContext,
  ConnectorPullInput,
  ConnectorPullResult,
  ConnectorPushInput,
  ConnectorPushResult,
  ConnectorWebhookInput,
  ConnectorWebhookResult
} from './connector.types';

export interface ConnectorInterface {
  authenticate(context: ConnectorContext, input: ConnectorAuthInput): Promise<ConnectorAuthResult>;
  pull(context: ConnectorContext, input: ConnectorPullInput): Promise<ConnectorPullResult>;
  push(context: ConnectorContext, input: ConnectorPushInput): Promise<ConnectorPushResult>;
  handleWebhook(context: ConnectorContext, input: ConnectorWebhookInput): Promise<ConnectorWebhookResult>;
}
