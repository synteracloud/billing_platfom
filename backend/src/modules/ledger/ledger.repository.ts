import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CreateJournalEntryInput, JournalEntryEntity } from './entities/journal-entry.entity';
import { JournalLineEntity } from './entities/journal-line.entity';

type JournalEntryRow = {
  id: string;
  tenant_id: string;
  source_event_id: string;
  rule_version: string;
  status: string;
  currency: string;
  entry_date: string;
  posted_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type JournalLineRow = Omit<JournalLineEntity, 'amount_minor'> & {
  amount_minor: string;
};

@Injectable()
export class LedgerRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createEntry(input: CreateJournalEntryInput): Promise<JournalEntryEntity> {
    this.validateEntry(input);

    const entryId = randomUUID();
    const now = new Date().toISOString();
    const metadata = input.metadata ?? {};
    const lineRecords = input.lines.map((line) => ({
      id: randomUUID(),
      tenant_id: input.tenant_id,
      journal_entry_id: entryId,
      account_code: line.account_code,
      direction: line.direction,
      amount_minor: line.amount_minor,
      description: line.description ?? null,
      created_at: now,
      updated_at: now
    }));

    try {
      await this.databaseService.withTransaction(async () => {
        await this.databaseService.query(
          `INSERT INTO journal_entry (
            id,
            tenant_id,
            source_event_id,
            rule_version,
            status,
            currency,
            entry_date,
            posted_at,
            metadata,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [
            entryId,
            input.tenant_id,
            input.source_event_id,
            input.rule_version,
            input.status,
            input.currency,
            input.entry_date,
            input.posted_at ?? null,
            JSON.stringify(metadata),
            now,
            now
          ]
        );

        for (const line of lineRecords) {
          await this.databaseService.query(
            `INSERT INTO journal_line (
              id,
              tenant_id,
              journal_entry_id,
              account_code,
              direction,
              amount_minor,
              description,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              line.id,
              line.tenant_id,
              line.journal_entry_id,
              line.account_code,
              line.direction,
              line.amount_minor,
              line.description,
              line.created_at,
              line.updated_at
            ]
          );
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Journal entry already exists for the provided tenant/source/rule version');
      }
      throw error;
    }

    return {
      id: entryId,
      tenant_id: input.tenant_id,
      source_event_id: input.source_event_id,
      rule_version: input.rule_version,
      status: input.status,
      currency: input.currency,
      entry_date: input.entry_date,
      posted_at: input.posted_at ?? null,
      metadata,
      created_at: now,
      updated_at: now,
      lines: lineRecords
    };
  }

  async findByReference(
    tenantId: string,
    sourceEventId: string,
    ruleVersion?: string
  ): Promise<JournalEntryEntity | null> {
    const params: unknown[] = [tenantId, sourceEventId];
    let sql = `
      SELECT
        id,
        tenant_id,
        source_event_id,
        rule_version,
        status,
        currency,
        entry_date::text AS entry_date,
        posted_at::text AS posted_at,
        metadata,
        created_at::text AS created_at,
        updated_at::text AS updated_at
      FROM journal_entry
      WHERE tenant_id = $1
        AND source_event_id = $2`;

    if (ruleVersion) {
      params.push(ruleVersion);
      sql += ' AND rule_version = $3';
    }

    sql += ' ORDER BY created_at DESC LIMIT 1';

    const entryResult = await this.databaseService.query<JournalEntryRow>(sql, params);
    const entry = entryResult.rows[0];
    if (!entry) {
      return null;
    }

    const lines = await this.findLinesByEntryIds(tenantId, [entry.id]);
    return this.mapEntry(entry, lines.get(entry.id) ?? []);
  }

  async findByAccount(tenantId: string, accountCode: string): Promise<JournalEntryEntity[]> {
    const entryResult = await this.databaseService.query<JournalEntryRow>(
      `
        SELECT DISTINCT je.id,
          je.tenant_id,
          je.source_event_id,
          je.rule_version,
          je.status,
          je.currency,
          je.entry_date::text AS entry_date,
          je.posted_at::text AS posted_at,
          je.metadata,
          je.created_at::text AS created_at,
          je.updated_at::text AS updated_at
        FROM journal_entry je
        INNER JOIN journal_line jl
          ON jl.tenant_id = je.tenant_id
         AND jl.journal_entry_id = je.id
        WHERE je.tenant_id = $1
          AND jl.account_code = $2
        ORDER BY je.entry_date DESC, je.created_at DESC`,
      [tenantId, accountCode]
    );

    if (entryResult.rows.length === 0) {
      return [];
    }

    const lines = await this.findLinesByEntryIds(
      tenantId,
      entryResult.rows.map((entry: JournalEntryRow) => entry.id)
    );

    return entryResult.rows.map((entry: JournalEntryRow) => this.mapEntry(entry, lines.get(entry.id) ?? []));
  }

  private async findLinesByEntryIds(
    tenantId: string,
    entryIds: readonly string[]
  ): Promise<Map<string, JournalLineEntity[]>> {
    if (entryIds.length === 0) {
      return new Map();
    }

    const lineResult = await this.databaseService.query<JournalLineRow>(
      `
        SELECT
          id,
          tenant_id,
          journal_entry_id,
          account_code,
          direction,
          amount_minor::text AS amount_minor,
          description,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM journal_line
        WHERE tenant_id = $1
          AND journal_entry_id = ANY($2::uuid[])
        ORDER BY created_at ASC, id ASC`,
      [tenantId, entryIds]
    );

    const linesByEntry = new Map<string, JournalLineEntity[]>();
    for (const line of lineResult.rows) {
      const existing = linesByEntry.get(line.journal_entry_id) ?? [];
      existing.push({
        ...line,
        amount_minor: Number(line.amount_minor)
      });
      linesByEntry.set(line.journal_entry_id, existing);
    }

    return linesByEntry;
  }

  private mapEntry(entry: JournalEntryRow, lines: readonly JournalLineEntity[]): JournalEntryEntity {
    return {
      ...entry,
      metadata: entry.metadata ?? {},
      lines
    };
  }

  private validateEntry(input: CreateJournalEntryInput): void {
    if (input.lines.length < 2) {
      throw new BadRequestException('Journal entries must contain at least two lines');
    }

    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of input.lines) {
      if (line.amount_minor <= 0) {
        throw new BadRequestException('Journal line amounts must be greater than zero');
      }

      if (line.direction === 'debit') {
        debitTotal += line.amount_minor;
        continue;
      }

      creditTotal += line.amount_minor;
    }

    if (debitTotal !== creditTotal) {
      throw new BadRequestException('Journal entry must be balanced before persisting');
    }
  }
}
