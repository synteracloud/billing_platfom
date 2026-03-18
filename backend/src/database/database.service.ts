import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.constants';

interface TransactionContext {
  client: PoolClient;
  depth: number;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly txStorage = new AsyncLocalStorage<TransactionContext>();

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const context = this.txStorage.getStore();
    if (context) {
      return context.client.query<T>(sql, params);
    }

    return this.pool.query<T>(sql, params);
  }

  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const existing = this.txStorage.getStore();

    if (existing) {
      const savepoint = `sp_${existing.depth + 1}`;
      await existing.client.query(`SAVEPOINT ${savepoint}`);
      const nestedContext: TransactionContext = {
        client: existing.client,
        depth: existing.depth + 1
      };

      return this.txStorage.run(nestedContext, async () => {
        try {
          const result = await operation();
          await existing.client.query(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await existing.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          throw error;
        }
      });
    }

    const client = await this.pool.connect();
    const rootContext: TransactionContext = {
      client,
      depth: 0
    };

    try {
      await client.query('BEGIN');
      const result = await this.txStorage.run(rootContext, operation);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
