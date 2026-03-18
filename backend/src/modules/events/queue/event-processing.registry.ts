import { Injectable } from '@nestjs/common';
import { QueueEnvelope } from './event-queue.types';

export type EventProcessorHandler = (event: QueueEnvelope) => Promise<void> | void;

@Injectable()
export class EventProcessingRegistry {
  private readonly handlers = new Map<string, EventProcessorHandler[]>();

  register(eventName: string, handler: EventProcessorHandler): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  getHandlers(eventName: string): EventProcessorHandler[] {
    return this.handlers.get(eventName) ?? [];
  }
}
