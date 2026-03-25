export type ConnectorDirection = 'inbound' | 'outbound';

export interface ConnectorContext {
  tenantId: string;
  connectorId: string;
  provider: string;
}

export interface ConnectorAuthInput {
  credentials: Record<string, unknown>;
  scope?: string[];
}

export interface ConnectorAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorPullInput {
  cursor?: string;
  from?: string;
  to?: string;
  objectTypes?: string[];
}

export interface ConnectorPushRecord {
  objectType: string;
  objectId?: string;
  payload: Record<string, unknown>;
}

export interface ConnectorPushInput {
  records: ConnectorPushRecord[];
  idempotencyKey?: string;
}

export interface ConnectorWebhookInput {
  headers: Record<string, string | string[]>;
  body: unknown;
  signature?: string;
}

export interface ConnectorTransportRecord {
  objectType: string;
  objectId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  rawRef?: string;
}

export interface ConnectorNormalizationTrigger {
  trigger: 'normalization.requested.v1';
  direction: ConnectorDirection;
  records: ConnectorTransportRecord[];
  cursor?: string;
  receivedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorPullResult {
  normalization: ConnectorNormalizationTrigger;
  nextCursor?: string;
  hasMore?: boolean;
}

export interface ConnectorPushResult {
  normalization: ConnectorNormalizationTrigger;
  acceptedCount: number;
}

export interface ConnectorWebhookResult {
  normalization: ConnectorNormalizationTrigger;
  acknowledged: boolean;
}
