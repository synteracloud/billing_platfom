import { Injectable } from '@nestjs/common';
import { QueueEnvelope } from './event-queue.types';

export type EventProcessorHandler = (event: QueueEnvelope) => Promise<void> | void;
export interface RegisteredEventHandler {
  name: string;
  handle: EventProcessorHandler;
}

@Injectable()
export class EventProcessingRegistry {
  private readonly handlers = new Map<string, RegisteredEventHandler[]>();

  register(eventName: string, handlerName: string, handler: EventProcessorHandler): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push({
      name: handlerName.trim(),
      handle: handler
    });
    this.handlers.set(eventName, handlers);
  }

  getHandlers(eventName: string): RegisteredEventHandler[] {
    return this.handlers.get(eventName) ?? [];
  }
}
