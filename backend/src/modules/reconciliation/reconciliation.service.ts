import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ReconciliationItem,
  ReconciliationMatch,
  ReconciliationRepository
} from './reconciliation.repository';

@Injectable()
export class ReconciliationService {
  constructor(private readonly reconciliationRepository: ReconciliationRepository) {}

  getUnmatchedItems(tenantId: string, sourceType?: string, limit = 100): ReconciliationItem[] {
    return this.reconciliationRepository.listUnmatchedItems(tenantId, sourceType, limit);
  }

  getMatches(tenantId: string, itemId?: string): ReconciliationMatch[] {
    return this.reconciliationRepository.listMatches(tenantId, itemId);
  }

  createManualMatch(
    tenantId: string,
    params: { left_item_id: string; right_item_id: string; reason?: string | null }
  ): ReconciliationMatch {
    const leftItemId = params.left_item_id?.trim();
    const rightItemId = params.right_item_id?.trim();

    if (!leftItemId || !rightItemId) {
      throw new BadRequestException('left_item_id and right_item_id are required');
    }

    if (leftItemId === rightItemId) {
      throw new BadRequestException('cannot create manual match with the same reconciliation item');
    }

    const leftItem = this.reconciliationRepository.findItem(tenantId, leftItemId);
    const rightItem = this.reconciliationRepository.findItem(tenantId, rightItemId);
    if (!leftItem || !rightItem) {
      throw new NotFoundException('reconciliation item not found');
    }

    if (leftItem.status !== 'unmatched' || rightItem.status !== 'unmatched') {
      throw new BadRequestException('manual match can only be created for unmatched reconciliation items');
    }

    if (leftItem.currency_code !== rightItem.currency_code) {
      throw new BadRequestException('manual match currency must match across reconciliation items');
    }

    if (leftItem.amount_minor !== rightItem.amount_minor) {
      throw new BadRequestException('manual match amount must be equal across reconciliation items');
    }

    return this.reconciliationRepository.createManualMatch(tenantId, {
      id: randomUUID(),
      left_item_id: leftItem.id,
      right_item_id: rightItem.id,
      reason: params.reason ?? null,
      created_at: new Date().toISOString()
    });
  }
}
