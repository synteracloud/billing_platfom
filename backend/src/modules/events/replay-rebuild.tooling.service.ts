import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { ApRepository, PayableBillPosition } from '../ap/ap.repository';
import { ArRepository, ReceivableInvoicePosition } from '../ar/ar.repository';
import { DomainEvent } from './entities/event.entity';
import { EventsRepository } from './events.repository';
import { LedgerRepository } from '../ledger/ledger.repository';

interface ReplayableProjectionState {
  arPositions: Map<string, ReceivableInvoicePosition>;
  apPositions: Map<string, PayableBillPosition>;
}

export interface RebuildSnapshot {
  tenant_id: string;
  replayed_event_ids: string[];
  ar_positions: ReceivableInvoicePosition[];
  ap_positions: PayableBillPosition[];
  analytics: {
    inflow_total_minor: number;
    outflow_total_minor: number;
    cashflow_net_minor: number;
  };
  ledger_reference_integrity: {
    expected_source_event_count: number;
    referenced_source_event_count: number;
    missing_source_event_ids: string[];
    duplicate_source_reference_keys: string[];
  };
}

export interface RebuildConsistencyReport {
  tenant_id: string;
  passed: boolean;
  diffs: string[];
  rebuilt: RebuildSnapshot;
  live: {
    ar_open_total_minor: number;
    ap_open_total_minor: number;
    analytics_inflow_total_minor: number;
    analytics_outflow_total_minor: number;
    analytics_cashflow_net_minor: number;
  };
}

@Injectable()
export class ReplayRebuildToolingService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly arRepository: ArRepository,
    private readonly apRepository: ApRepository,
    private readonly analyticsService: AnalyticsService
  ) {}

  replayProjectionStreams(tenantId: string): RebuildSnapshot {
    const orderedEvents = this.getReplayOrderedEvents(tenantId);
    const replayed = this.rebuildProjectionState(orderedEvents);
    const ledgerIntegrity = this.verifyLedgerReferenceIntegrity(tenantId, orderedEvents);

    const inflowTotal = Array.from(replayed.arPositions.values())
      .filter((invoice) => invoice.status === 'open' && invoice.open_amount_minor > 0)
      .reduce((sum, invoice) => sum + invoice.open_amount_minor, 0);

    const outflowTotal = Array.from(replayed.apPositions.values())
      .filter((bill) => bill.status === 'open' && bill.open_amount_minor > 0)
      .reduce((sum, bill) => sum + bill.open_amount_minor, 0);

    return {
      tenant_id: tenantId,
      replayed_event_ids: orderedEvents.map((event) => event.id),
      ar_positions: Array.from(replayed.arPositions.values()).sort((left, right) => left.invoice_id.localeCompare(right.invoice_id)),
      ap_positions: Array.from(replayed.apPositions.values()).sort((left, right) => left.bill_id.localeCompare(right.bill_id)),
      analytics: {
        inflow_total_minor: inflowTotal,
        outflow_total_minor: outflowTotal,
        cashflow_net_minor: this.analyticsService.getCashflow(tenantId).totals.net_minor
      },
      ledger_reference_integrity: ledgerIntegrity
    };
  }

  rebuildAndVerifyConsistency(tenantId: string): RebuildConsistencyReport {
    const rebuilt = this.replayProjectionStreams(tenantId);
    const liveArOpen = this.arRepository
      .listInvoices(tenantId)
      .filter((invoice) => invoice.status === 'open')
      .reduce((sum, invoice) => sum + invoice.open_amount_minor, 0);

    const liveApOpen = this.apRepository
      .listBills(tenantId)
      .filter((bill) => bill.status === 'open')
      .reduce((sum, bill) => sum + bill.open_amount_minor, 0);

    const liveInflow = this.analyticsService.getInflowProjection(tenantId).total_minor;
    const liveOutflow = this.analyticsService.getOutflowProjection(tenantId).total_minor;
    const liveCashflow = this.analyticsService.getCashflow(tenantId).totals.net_minor;

    const diffs: string[] = [];
    if (rebuilt.analytics.inflow_total_minor !== liveInflow) {
      diffs.push(`AR inflow mismatch: rebuilt=${rebuilt.analytics.inflow_total_minor}, live=${liveInflow}`);
    }

    if (rebuilt.analytics.outflow_total_minor !== liveOutflow) {
      diffs.push(`AP outflow mismatch: rebuilt=${rebuilt.analytics.outflow_total_minor}, live=${liveOutflow}`);
    }

    if (rebuilt.analytics.cashflow_net_minor !== liveCashflow) {
      diffs.push(`Cashflow mismatch: rebuilt=${rebuilt.analytics.cashflow_net_minor}, live=${liveCashflow}`);
    }

    const rebuiltArOpen = rebuilt.ar_positions.filter((position) => position.status === 'open').reduce((sum, item) => sum + item.open_amount_minor, 0);
    if (rebuiltArOpen !== liveArOpen) {
      diffs.push(`AR open balance mismatch: rebuilt=${rebuiltArOpen}, live=${liveArOpen}`);
    }

    const rebuiltApOpen = rebuilt.ap_positions.filter((position) => position.status === 'open').reduce((sum, item) => sum + item.open_amount_minor, 0);
    if (rebuiltApOpen !== liveApOpen) {
      diffs.push(`AP open balance mismatch: rebuilt=${rebuiltApOpen}, live=${liveApOpen}`);
    }

    if (rebuilt.ledger_reference_integrity.missing_source_event_ids.length > 0) {
      diffs.push(`Missing ledger source references: ${rebuilt.ledger_reference_integrity.missing_source_event_ids.join(',')}`);
    }

    if (rebuilt.ledger_reference_integrity.duplicate_source_reference_keys.length > 0) {
      diffs.push(`Duplicate ledger source references: ${rebuilt.ledger_reference_integrity.duplicate_source_reference_keys.join(',')}`);
    }

    return {
      tenant_id: tenantId,
      passed: diffs.length === 0,
      diffs,
      rebuilt,
      live: {
        ar_open_total_minor: liveArOpen,
        ap_open_total_minor: liveApOpen,
        analytics_inflow_total_minor: liveInflow,
        analytics_outflow_total_minor: liveOutflow,
        analytics_cashflow_net_minor: liveCashflow
      }
    };
  }

  simulateMissedEventRecovery(tenantId: string, missedEventId: string): { drift_detected: boolean; recovered: boolean; before: RebuildSnapshot; after: RebuildSnapshot } {
    const ordered = this.getReplayOrderedEvents(tenantId);
    const withoutMissed = this.rebuildProjectionState(ordered.filter((event) => event.id !== missedEventId));
    const withAll = this.rebuildProjectionState(ordered);

    const before: RebuildSnapshot = {
      ...this.replayProjectionStreams(tenantId),
      ar_positions: Array.from(withoutMissed.arPositions.values()),
      ap_positions: Array.from(withoutMissed.apPositions.values())
    };

    const after = this.replayProjectionStreams(tenantId);
    const driftDetected = JSON.stringify(before.ar_positions) !== JSON.stringify(after.ar_positions)
      || JSON.stringify(before.ap_positions) !== JSON.stringify(after.ap_positions);

    const fullyRecovered = JSON.stringify(Array.from(withAll.arPositions.values()).sort((a, b) => a.invoice_id.localeCompare(b.invoice_id)))
      === JSON.stringify(after.ar_positions)
      && JSON.stringify(Array.from(withAll.apPositions.values()).sort((a, b) => a.bill_id.localeCompare(b.bill_id)))
      === JSON.stringify(after.ap_positions);

    return {
      drift_detected: driftDetected,
      recovered: fullyRecovered,
      before,
      after
    };
  }

  private getReplayOrderedEvents(tenantId: string): DomainEvent[] {
    return this.eventsRepository
      .listAll()
      .filter((event) => event.tenant_id === tenantId)
      .filter((event) => this.isProjectionRelevant(event.type))
      .sort((left, right) => {
        return left.occurred_at.localeCompare(right.occurred_at)
          || left.recorded_at.localeCompare(right.recorded_at)
          || left.id.localeCompare(right.id);
      });
  }

  private rebuildProjectionState(events: DomainEvent[]): ReplayableProjectionState {
    const arPositions = new Map<string, ReceivableInvoicePosition>();
    const apPositions = new Map<string, PayableBillPosition>();
    const seenEventIds = new Set<string>();

    for (const event of events) {
      if (seenEventIds.has(event.id)) {
        continue;
      }

      seenEventIds.add(event.id);
      const payload = event.payload as Record<string, unknown>;

      if (event.type === 'billing.invoice.issued.v1') {
        const invoiceId = String(payload.invoice_id);
        const totalMinor = this.toSafeMinor(payload.total_minor);
        const previous = arPositions.get(invoiceId);
        const openMinor = previous ? previous.open_amount_minor : totalMinor;
        arPositions.set(invoiceId, {
          invoice_id: invoiceId,
          customer_id: String(payload.customer_id),
          currency_code: String(payload.currency_code),
          issue_date: String(payload.issue_date),
          due_date: payload.due_date ? String(payload.due_date) : null,
          total_minor: totalMinor,
          open_amount_minor: Math.max(0, Math.min(totalMinor, openMinor)),
          paid_amount_minor: Math.max(0, totalMinor - Math.max(0, Math.min(totalMinor, openMinor))),
          status: openMinor <= 0 ? 'closed' : 'open',
          updated_at: event.recorded_at
        });
      }

      if (event.type === 'billing.payment.allocated.v1' || event.type === 'billing.payment.refunded.v1') {
        const allocationChanges = Array.isArray(payload.allocation_changes) ? payload.allocation_changes as Array<Record<string, unknown>> : [];
        for (const change of allocationChanges) {
          const invoiceId = String(change.invoice_id);
          const invoice = arPositions.get(invoiceId);
          if (!invoice || invoice.status === 'void') {
            continue;
          }

          const delta = this.toSafeMinor(change.allocated_delta_minor);
          const nextOpen = Math.max(0, Math.min(invoice.total_minor, invoice.open_amount_minor - delta));
          arPositions.set(invoiceId, {
            ...invoice,
            open_amount_minor: nextOpen,
            paid_amount_minor: Math.max(0, invoice.total_minor - nextOpen),
            status: nextOpen === 0 ? 'closed' : 'open',
            updated_at: event.recorded_at
          });
        }
      }

      if (event.type === 'billing.invoice.voided.v1') {
        const invoiceId = String(payload.invoice_id);
        const invoice = arPositions.get(invoiceId);
        if (invoice) {
          arPositions.set(invoiceId, {
            ...invoice,
            open_amount_minor: 0,
            paid_amount_minor: 0,
            status: 'void',
            updated_at: event.recorded_at
          });
        }
      }

      if (event.type === 'billing.bill.approved.v1' || event.type === 'billing.bill.created.v1') {
        const billId = String(payload.bill_id);
        const totalMinor = this.toSafeMinor(payload.total_minor);
        const previous = apPositions.get(billId);
        const openMinor = previous ? previous.open_amount_minor : totalMinor;
        apPositions.set(billId, {
          bill_id: billId,
          vendor_id: String(payload.vendor_id),
          currency_code: String(payload.currency_code),
          approved_at: String(payload.approved_at ?? payload.created_at),
          due_date: payload.due_date ? String(payload.due_date) : null,
          total_minor: totalMinor,
          open_amount_minor: Math.max(0, Math.min(totalMinor, openMinor)),
          paid_amount_minor: Math.max(0, totalMinor - Math.max(0, Math.min(totalMinor, openMinor))),
          status: openMinor <= 0 ? 'closed' : 'open',
          updated_at: event.recorded_at
        });
      }

      if (event.type === 'billing.bill.paid.v1') {
        const billId = String(payload.bill_id);
        const bill = apPositions.get(billId);
        if (!bill || bill.status === 'void') {
          continue;
        }

        const paymentDelta = this.toSafeMinor(payload.amount_paid_minor);
        const nextOpen = Math.max(0, Math.min(bill.total_minor, bill.open_amount_minor - paymentDelta));
        apPositions.set(billId, {
          ...bill,
          open_amount_minor: nextOpen,
          paid_amount_minor: Math.max(0, bill.total_minor - nextOpen),
          status: nextOpen === 0 ? 'closed' : 'open',
          updated_at: event.recorded_at
        });
      }
    }

    return {
      arPositions,
      apPositions
    };
  }

  private verifyLedgerReferenceIntegrity(tenantId: string, orderedEvents: DomainEvent[]): RebuildSnapshot['ledger_reference_integrity'] {
    const expectedSourceEventIds = new Set(
      orderedEvents
        .filter((event) => event.type === 'billing.invoice.created.v1' || event.type === 'billing.payment.recorded.v1' || event.type === 'billing.bill.created.v1')
        .map((event) => event.id)
    );

    const duplicateKeys = new Set<string>();
    const sourceRefKeys = new Set<string>();
    const referencedSourceEventIds = new Set<string>();

    for (const entry of this.ledgerRepository.listEntries(tenantId)) {
      const key = `${entry.source_event_id}::${entry.rule_version}`;
      if (sourceRefKeys.has(key)) {
        duplicateKeys.add(key);
      }
      sourceRefKeys.add(key);
      referencedSourceEventIds.add(entry.source_event_id);
    }

    const missing = Array.from(expectedSourceEventIds.values())
      .filter((eventId) => !referencedSourceEventIds.has(eventId))
      .sort((a, b) => a.localeCompare(b));

    return {
      expected_source_event_count: expectedSourceEventIds.size,
      referenced_source_event_count: referencedSourceEventIds.size,
      missing_source_event_ids: missing,
      duplicate_source_reference_keys: Array.from(duplicateKeys.values()).sort((a, b) => a.localeCompare(b))
    };
  }

  private isProjectionRelevant(type: string): boolean {
    return type === 'billing.invoice.created.v1'
      || type === 'billing.invoice.issued.v1'
      || type === 'billing.payment.allocated.v1'
      || type === 'billing.payment.refunded.v1'
      || type === 'billing.invoice.voided.v1'
      || type === 'billing.bill.created.v1'
      || type === 'billing.bill.approved.v1'
      || type === 'billing.bill.paid.v1'
      || type === 'billing.payment.recorded.v1';
  }

  private toSafeMinor(input: unknown): number {
    const numeric = Number(input);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Math.max(0, Math.round(numeric));
  }
}
