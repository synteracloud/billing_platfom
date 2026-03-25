export type ConnectorLifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'failed';

export interface ConnectorContext {
  readonly registeredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface Connector {
  readonly id: string;
  readonly name: string;
  start(context: ConnectorContext): Promise<void> | void;
  stop(): Promise<void> | void;
}

export interface ConnectorRegistration {
  connector: Connector;
  metadata?: Record<string, unknown>;
}

export interface ConnectorRuntimeSnapshot {
  id: string;
  name: string;
  state: ConnectorLifecycleState;
  startedAt: string | null;
  stoppedAt: string | null;
  lastError: string | null;
}

export interface ConnectorBatchResult {
  started: string[];
  stopped: string[];
  failed: Array<{ connectorId: string; reason: string }>;
}
