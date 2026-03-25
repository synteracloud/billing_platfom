import { Injectable } from '@nestjs/common';
import { BaseTransportConnector } from './base-transport.connector';
import { ProviderTransport } from './provider-transport.interface';

@Injectable()
export class StripeConnector extends BaseTransportConnector {
  constructor(transport: ProviderTransport) {
    super(transport);
  }
}
