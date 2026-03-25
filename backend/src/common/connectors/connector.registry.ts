import { Connector, ConnectorRegistration } from './connector.types';
import { ConnectorAlreadyRegisteredError, ConnectorNotFoundError } from './connector.errors';

interface RegisteredConnector {
  connector: Connector;
  metadata: Readonly<Record<string, unknown>>;
  registeredAt: string;
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, RegisteredConnector>();

  register(registration: ConnectorRegistration): void {
    const connectorId = registration.connector.id.trim();

    if (this.connectors.has(connectorId)) {
      throw new ConnectorAlreadyRegisteredError(connectorId);
    }

    this.connectors.set(connectorId, {
      connector: registration.connector,
      metadata: Object.freeze({ ...(registration.metadata ?? {}) }),
      registeredAt: new Date().toISOString()
    });
  }

  unregister(connectorId: string): void {
    if (!this.connectors.delete(connectorId)) {
      throw new ConnectorNotFoundError(connectorId);
    }
  }

  get(connectorId: string): RegisteredConnector {
    const connector = this.connectors.get(connectorId);

    if (!connector) {
      throw new ConnectorNotFoundError(connectorId);
    }

    return connector;
  }

  list(): RegisteredConnector[] {
    return [...this.connectors.values()];
  }
}
