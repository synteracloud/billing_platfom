import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { BankTransactionsRepository } from './bank-transactions.repository';
import { BankTransaction, InboundBankTransaction } from './entities/bank-transaction.entity';

export interface IngestBankTransactionsResult {
  ingested: BankTransaction[];
  duplicates: BankTransaction[];
}

@Injectable()
export class BankConnectorService {
  constructor(private readonly bankTransactionsRepository: BankTransactionsRepository) {}

  ingestTransactions(tenantId: string, inboundTransactions: InboundBankTransaction[]): IngestBankTransactionsResult {
    const ingested: BankTransaction[] = [];
    const duplicates: BankTransaction[] = [];

    for (const inbound of inboundTransactions) {
      const mapped = this.mapToBankTransaction(tenantId, inbound);
      const { transaction, inserted } = this.bankTransactionsRepository.upsert(mapped);

      if (inserted) {
        ingested.push(transaction);
      } else {
        duplicates.push(transaction);
      }
    }

    return { ingested, duplicates };
  }

  mapToBankTransaction(tenantId: string, inbound: InboundBankTransaction): BankTransaction {
    const externalId = this.normalizeText(inbound.external_id ?? inbound.transaction_id, true) ?? this.generateFallbackExternalId(inbound);
    const accountId = this.normalizeText(inbound.account_id, true) ?? 'unassigned';
    const postedDate = this.normalizeDate(inbound.posted_at ?? inbound.booked_at);
    const currency = this.normalizeCurrency(inbound.currency);
    const amountMinor = this.normalizeAmountMinor(inbound.amount_minor, inbound.amount);
    const direction: 'credit' | 'debit' = amountMinor >= 0 ? 'credit' : 'debit';
    const description = this.normalizeText(inbound.description, false) ?? '';
    const counterpartyName = this.normalizeText(inbound.counterparty_name, false);
    const reference = this.normalizeText(inbound.reference, true);

    const dedupeKey = this.computeDedupeKey({
      tenantId,
      externalId,
      accountId,
      postedDate,
      amountMinor,
      currency,
      reference
    });

    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      tenant_id: tenantId,
      dedupe_key: dedupeKey,
      external_id: externalId,
      account_id: accountId,
      posted_date: postedDate,
      amount_minor: amountMinor,
      currency,
      direction,
      description,
      counterparty_name: counterpartyName,
      reference,
      metadata: inbound.metadata ?? {},
      raw_payload: this.cloneInbound(inbound),
      created_at: now,
      updated_at: now
    };
  }

  private normalizeText(value: unknown, uppercase: boolean): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const squashed = value.replace(/\s+/g, ' ').trim();
    if (!squashed) {
      return null;
    }

    return uppercase ? squashed.toUpperCase() : squashed;
  }

  private normalizeCurrency(value: unknown): string {
    const normalized = this.normalizeText(value, true);
    return normalized ?? 'USD';
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return new Date(0).toISOString().slice(0, 10);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(0).toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
  }

  private normalizeAmountMinor(explicitMinor: unknown, amount: unknown): number {
    if (typeof explicitMinor === 'number' && Number.isFinite(explicitMinor)) {
      return Math.round(explicitMinor);
    }

    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return Math.round(amount * 100);
    }

    if (typeof amount === 'string') {
      const parsed = Number.parseFloat(amount);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed * 100);
      }
    }

    return 0;
  }

  private generateFallbackExternalId(inbound: InboundBankTransaction): string {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(this.cloneInbound(inbound)))
      .digest('hex')
      .slice(0, 24);

    return `FALLBACK-${payloadHash}`;
  }

  private computeDedupeKey(input: {
    tenantId: string;
    externalId: string;
    accountId: string;
    postedDate: string;
    amountMinor: number;
    currency: string;
    reference: string | null;
  }): string {
    const basis = [
      input.tenantId,
      input.externalId,
      input.accountId,
      input.postedDate,
      String(input.amountMinor),
      input.currency,
      input.reference ?? ''
    ].join('|');

    return createHash('sha256').update(basis).digest('hex');
  }

  private cloneInbound(inbound: InboundBankTransaction): Record<string, unknown> {
    return JSON.parse(JSON.stringify(inbound)) as Record<string, unknown>;
  }
}
