import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

type Snapshot = unknown;

export type TransactionParticipant = {
  key: string;
  snapshot: () => Snapshot;
  restore: (snapshot: Snapshot) => void;
  validate?: () => void;
};

type TransactionContext = {
  id: number;
  depth: number;
  snapshots: Map<string, { restore: (snapshot: Snapshot) => void; value: Snapshot }>;
  validators: Map<string, () => void>;
  afterCommitCallbacks: Array<() => void | Promise<void>>;
  rolledBack: boolean;
  release: () => void;
};

@Injectable()
export class FinancialTransactionManager {
  private readonly contextStorage = new AsyncLocalStorage<number>();
  private activeContext: TransactionContext | null = null;
  private lockQueue: Promise<void> = Promise.resolve();
  private nextContextId = 1;

  async wrapper<T>(fn: () => T | Promise<T>, participants: TransactionParticipant[]): Promise<T> {
    const existingContext = this.activeContext;
    const currentContextId = this.contextStorage.getStore();

    if (existingContext && currentContextId === existingContext.id && existingContext.depth > 0) {
      await this.begin(participants);
      try {
        const result = await fn();
        await this.commit();
        return result;
      } catch (error) {
        await this.rollback();
        throw error;
      }
    }

    const topLevelContext = await this.createTopLevelContext(participants);
    return this.contextStorage.run(topLevelContext.id, async () => {
      try {
        const result = await fn();
        await this.commit();
        return result;
      } catch (error) {
        await this.rollback();
        throw error;
      }
    });
  }

  async begin(participants: TransactionParticipant[]): Promise<void> {
    const context = this.requireContext();
    context.depth += 1;

    for (const participant of participants) {
      if (!context.snapshots.has(participant.key)) {
        context.snapshots.set(participant.key, {
          restore: participant.restore,
          value: participant.snapshot()
        });
      }

      if (participant.validate && !context.validators.has(participant.key)) {
        context.validators.set(participant.key, participant.validate);
      }
    }
  }

  async commit(): Promise<void> {
    const context = this.requireContext();
    if (context.rolledBack) {
      throw new Error('Cannot commit a rolled back transaction');
    }

    if (context.depth === 1) {
      for (const validator of context.validators.values()) {
        validator();
      }
    }

    context.depth -= 1;
    if (context.depth === 0) {
      for (const callback of context.afterCommitCallbacks) {
        await callback();
      }
      this.releaseContext(context);
    }
  }

  async rollback(): Promise<void> {
    const currentContextId = this.contextStorage.getStore();
    if (!this.activeContext || !currentContextId || this.activeContext.id !== currentContextId || this.activeContext.depth <= 0) {
      return;
    }

    const context = this.activeContext;

    if (!context.rolledBack) {
      context.rolledBack = true;
      for (const snapshot of context.snapshots.values()) {
        snapshot.restore(snapshot.value);
      }
    }

    this.releaseContext(context);
  }

  runAfterCommit(callback: () => void | Promise<void>): void {
    const context = this.requireContext();
    context.afterCommitCallbacks.push(callback);
  }

  private requireContext(): TransactionContext {
    const currentContextId = this.contextStorage.getStore();
    if (!this.activeContext || !currentContextId || this.activeContext.id !== currentContextId || this.activeContext.depth <= 0) {
      throw new Error('No active transaction context');
    }

    return this.activeContext;
  }

  private releaseContext(context: TransactionContext): void {
    context.depth = 0;
    context.release();
    if (this.activeContext && this.activeContext.id === context.id) {
      this.activeContext = null;
    }
  }

  private async createTopLevelContext(participants: TransactionParticipant[]): Promise<TransactionContext> {
    const release = await this.acquireLock();
    const snapshots = new Map<string, { restore: (snapshot: Snapshot) => void; value: Snapshot }>();
    const validators = new Map<string, () => void>();

    try {
      for (const participant of participants) {
        if (!snapshots.has(participant.key)) {
          snapshots.set(participant.key, {
            restore: participant.restore,
            value: participant.snapshot()
          });
        }

        if (participant.validate && !validators.has(participant.key)) {
          validators.set(participant.key, participant.validate);
        }
      }
    } catch (error) {
      release();
      throw error;
    }

    const context: TransactionContext = {
      id: this.nextContextId++,
      depth: 1,
      snapshots,
      validators,
      afterCommitCallbacks: [],
      rolledBack: false,
      release
    };

    this.activeContext = context;
    return context;
  }

  private async acquireLock(): Promise<() => void> {
    let releaseLock: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previous = this.lockQueue;
    this.lockQueue = this.lockQueue.then(() => pending);
    await previous;

    return releaseLock;
  }
}
