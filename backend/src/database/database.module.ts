import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_CONFIG, DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

export interface DatabaseConfig {
  connectionString: string;
  maxConnections: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
}

function buildConfig(): DatabaseConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize PostgreSQL connection pool');
  }

  return {
    connectionString,
    maxConnections: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMs: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    statementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000)
  };
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: buildConfig
    },
    {
      provide: DATABASE_POOL,
      inject: [DATABASE_CONFIG],
      useFactory: (config: DatabaseConfig) =>
        new Pool({
          connectionString: config.connectionString,
          max: config.maxConnections,
          idleTimeoutMillis: config.idleTimeoutMs,
          statement_timeout: config.statementTimeoutMs,
          application_name: 'billing-platform-api'
        })
    },
    DatabaseService
  ],
  exports: [DatabaseService, DATABASE_POOL]
})
export class DatabaseModule {}
