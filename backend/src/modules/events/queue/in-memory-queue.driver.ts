import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueueDriver, QueueEnvelope, QueueJob, QueueJobOptions } from './event-queue.types';

type PendingJob = {
  name: string;
  data: QueueEnvelope;
  options: QueueJobOptions;
  attemptsMade: number;
};

@Injectable()
export class InMemoryQueueDriver implements QueueDriver, OnModuleDestroy {
  private readonly logger = new Logger(InMemoryQueueDriver.name);
  private readonly jobs = new Map<string, PendingJob>();
  private readonly aggregateChains = new Map<string, Promise<void>>();
  private processor: ((job: QueueJob) => Promise<void>) | null = null;
  private isClosed = false;

  async add<TPayload = unknown>(name: string, data: QueueEnvelope<TPayload>, options: QueueJobOptions): Promise<void> {
    if (this.isClosed || this.jobs.has(options.jobId)) {
      return;
    }

    this.jobs.set(options.jobId, {
      name,
      data,
      options,
      attemptsMade: 0
    });

    this.schedule(options.jobId, 0);
  }

  async registerProcessor(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    this.processor = handler;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    this.isClosed = true;
    await Promise.allSettled(this.aggregateChains.values());
    this.aggregateChains.clear();
    this.jobs.clear();
  }

  private schedule(jobId: string, delayMs: number): void {
    setTimeout(() => {
      void this.process(jobId);
    }, delayMs);
  }

  private async process(jobId: string): Promise<void> {
    const pending = this.jobs.get(jobId);
    if (!pending || !this.processor || this.isClosed) {
      return;
    }

    const aggregateKey = `${pending.data.aggregate_type}:${pending.data.aggregate_id}`;
    const previous = this.aggregateChains.get(aggregateKey) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        const latest = this.jobs.get(jobId);
        if (!latest || !this.processor || this.isClosed) {
          return;
        }

        latest.attemptsMade += 1;
        const job: QueueJob = {
          id: jobId,
          name: latest.name,
          data: latest.data,
          attemptsMade: latest.attemptsMade - 1
        };

        try {
          await this.processor(job);
          this.jobs.delete(jobId);
        } catch (error) {
          if (latest.attemptsMade >= latest.options.attempts) {
            this.logger.error(`Dead-lettering event ${latest.data.event_id}: ${(error as Error).message}`);
            this.jobs.delete(jobId);
            return;
          }

          this.logger.warn(
            `Retrying event ${latest.data.event_id} in ${latest.options.backoffDelayMs}ms after failure: ${(error as Error).message}`
          );
          this.schedule(jobId, latest.options.backoffDelayMs * latest.attemptsMade);
        }
      })
      .finally(() => {
        if (this.aggregateChains.get(aggregateKey) === current) {
          this.aggregateChains.delete(aggregateKey);
        }
      });

    this.aggregateChains.set(aggregateKey, current);
    await current;
  }
}
