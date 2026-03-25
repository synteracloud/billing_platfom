export class ConnectorError extends Error {
  readonly connectorId: string;
  readonly phase: 'register' | 'start' | 'stop';
  readonly causeError: unknown;

  constructor(connectorId: string, phase: 'register' | 'start' | 'stop', causeError: unknown) {
    const message = causeError instanceof Error ? causeError.message : String(causeError);
    super(`Connector ${connectorId} failed during ${phase}: ${message}`);
    this.name = 'ConnectorError';
    this.connectorId = connectorId;
    this.phase = phase;
    this.causeError = causeError;
  }
}

export class ConnectorAlreadyRegisteredError extends Error {
  constructor(connectorId: string) {
    super(`Connector with id "${connectorId}" is already registered.`);
    this.name = 'ConnectorAlreadyRegisteredError';
  }
}

export class ConnectorNotFoundError extends Error {
  constructor(connectorId: string) {
    super(`Connector with id "${connectorId}" was not found.`);
    this.name = 'ConnectorNotFoundError';
  }
}
