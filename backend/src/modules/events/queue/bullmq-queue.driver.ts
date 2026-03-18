import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueueDriver, QueueEnvelope, QueueJob, QueueJobOptions } from './event-queue.types';

type BullMqModule = {
  Queue: new (name: string, options: { connection: unknown }) => {
    add: (jobName: string, data: unknown, options: Record<string, unknown>) => Promise<void>;
    close: () => Promise<void>;
  };
  Worker: new (
    name: string,
    processor: (job: { id?: string; name: string; data: QueueEnvelope; attemptsMade: number }) => Promise<void>,
    options: { connection: unknown; concurrency: number }
  ) => {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    close: () => Promise<void>;
  };
};

type RedisClient = { quit: () => Promise<void> };
type RedisCtor = new (options: Record<string, unknown>) => RedisClient;

@Injectable()
export class BullMqQueueDriver implements QueueDriver, OnModuleDestroy {
  private readonly logger = new Logger(BullMqQueueDriver.name);
  private readonly queueName = process.env.EVENT_QUEUE_NAME ?? 'domain-events';
  private readonly concurrency = parseInt(process.env.EVENT_QUEUE_CONCURRENCY ?? '10', 10);
  private connection: RedisClient | null = null;
  private queue: InstanceType<BullMqModule['Queue']> | null = null;
  private worker: InstanceType<BullMqModule['Worker']> | null = null;

  async add<TPayload = unknown>(name: string, data: QueueEnvelope<TPayload>, options: QueueJobOptions): Promise<void> {
    const queue = this.getQueue();
    await queue.add(name, data, {
      jobId: options.jobId,
      attempts: options.attempts,
      backoff: {
        type: 'exponential',
        delay: options.backoffDelayMs
      },
      removeOnComplete: 1000,
      removeOnFail: false
    });
  }

  async registerProcessor(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    if (this.worker) {
      return;
    }

    const bullmq = this.resolveBullMq();
    const connection = this.getConnection();
    this.worker = new bullmq.Worker(
      this.queueName,
      async (job) => {
        await handler({
          id: job.id ?? job.data.event_id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade
        });
      },
      {
        connection,
        concurrency: this.concurrency
      }
    );

    this.worker.on('failed', (job: { data?: QueueEnvelope; attemptsMade?: number } | undefined, error: unknown) => {
      this.logger.error(
        `Event job ${job?.data?.event_id ?? 'unknown'} failed on attempt ${(job?.attemptsMade ?? 0) + 1}: ${(error as Error).message}`
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.connection) {
      await this.connection.quit();
      this.connection = null;
    }
  }

  private getQueue(): InstanceType<BullMqModule['Queue']> {
    if (this.queue) {
      return this.queue;
    }

    const bullmq = this.resolveBullMq();
    this.queue = new bullmq.Queue(this.queueName, { connection: this.getConnection() });
    return this.queue;
  }

  private getConnection(): RedisClient {
    if (this.connection) {
      return this.connection;
    }

    const Redis = this.resolveRedis();
    this.connection = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    return this.connection;
  }

  private resolveBullMq(): BullMqModule {
    return require('bullmq') as BullMqModule;
  }

  private resolveRedis(): RedisCtor {
    const redis = require('ioredis');
    return (redis.default ?? redis) as RedisCtor;
  }
}
