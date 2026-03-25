import { ConnectorError } from './connector.errors';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorBatchResult, ConnectorLifecycleState, ConnectorRuntimeSnapshot, ConnectorRegistration } from './connector.types';

interface ConnectorRuntimeState {
  state: ConnectorLifecycleState;
  startedAt: string | null;
  stoppedAt: string | null;
  lastError: string | null;
}

export class ConnectorManager {
  private readonly runtime = new Map<string, ConnectorRuntimeState>();

  constructor(private readonly registry: ConnectorRegistry = new ConnectorRegistry()) {}

  register(registration: ConnectorRegistration): void {
    this.registry.register(registration);
    this.runtime.set(registration.connector.id, {
      state: 'idle',
      startedAt: null,
      stoppedAt: null,
      lastError: null
    });
  }

  unregister(connectorId: string): void {
    this.registry.unregister(connectorId);
    this.runtime.delete(connectorId);
  }

  async start(connectorId: string): Promise<void> {
    const registered = this.registry.get(connectorId);
    const state = this.getRuntime(connectorId);
    state.state = 'starting';

    try {
      await registered.connector.start({
        registeredAt: registered.registeredAt,
        metadata: { ...registered.metadata }
      });
      state.state = 'running';
      state.startedAt = new Date().toISOString();
      state.lastError = null;
    } catch (error) {
      state.state = 'failed';
      state.lastError = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(connectorId, 'start', error);
    }
  }

  async stop(connectorId: string): Promise<void> {
    const registered = this.registry.get(connectorId);
    const state = this.getRuntime(connectorId);
    state.state = 'stopping';

    try {
      await registered.connector.stop();
      state.state = 'idle';
      state.stoppedAt = new Date().toISOString();
      state.lastError = null;
    } catch (error) {
      state.state = 'failed';
      state.lastError = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(connectorId, 'stop', error);
    }
  }

  async startAll(): Promise<ConnectorBatchResult> {
    const result: ConnectorBatchResult = { started: [], stopped: [], failed: [] };

    for (const connector of this.registry.list()) {
      try {
        await this.start(connector.connector.id);
        result.started.push(connector.connector.id);
      } catch (error) {
        result.failed.push({
          connectorId: connector.connector.id,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return result;
  }

  async stopAll(): Promise<ConnectorBatchResult> {
    const result: ConnectorBatchResult = { started: [], stopped: [], failed: [] };

    for (const connector of this.registry.list()) {
      try {
        await this.stop(connector.connector.id);
        result.stopped.push(connector.connector.id);
      } catch (error) {
        result.failed.push({
          connectorId: connector.connector.id,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return result;
  }

  getSnapshot(): ConnectorRuntimeSnapshot[] {
    return this.registry.list().map((entry) => {
      const state = this.getRuntime(entry.connector.id);
      return {
        id: entry.connector.id,
        name: entry.connector.name,
        state: state.state,
        startedAt: state.startedAt,
        stoppedAt: state.stoppedAt,
        lastError: state.lastError
      };
    });
  }

  private getRuntime(connectorId: string): ConnectorRuntimeState {
    const runtime = this.runtime.get(connectorId);

    if (!runtime) {
      this.runtime.set(connectorId, {
        state: 'idle',
        startedAt: null,
        stoppedAt: null,
        lastError: null
      });

      return this.runtime.get(connectorId)!;
    }

    return runtime;
  }
}
