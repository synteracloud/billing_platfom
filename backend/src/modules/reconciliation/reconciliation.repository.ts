import { Injectable } from '@nestjs/common';

export type ReconciliationItemStatus = 'unmatched' | 'matched';

export interface ReconciliationItem {
  id: string;
  tenant_id: string;
  source_type: string;
  source_ref: string;
  currency_code: string;
  amount_minor: number;
  occurred_at: string;
  status: ReconciliationItemStatus;
  updated_at: string;
}

export interface ReconciliationMatch {
  id: string;
  tenant_id: string;
  left_item_id: string;
  right_item_id: string;
  match_type: 'manual';
  reason: string | null;
  created_at: string;
}

@Injectable()
export class ReconciliationRepository {
  private readonly itemsByTenant = new Map<string, Map<string, ReconciliationItem>>();
  private readonly unmatchedItemIdsByTenant = new Map<string, Set<string>>();
  private readonly matchesByTenant = new Map<string, Map<string, ReconciliationMatch>>();
  private readonly matchIdsByItemKey = new Map<string, Map<string, Set<string>>>();

  upsertItem(item: ReconciliationItem): ReconciliationItem {
    const tenantItems = this.itemsByTenant.get(item.tenant_id) ?? new Map<string, ReconciliationItem>();
    const tenantUnmatchedIds = this.unmatchedItemIdsByTenant.get(item.tenant_id) ?? new Set<string>();

    const normalizedItem: ReconciliationItem = {
      ...item,
      status: item.status ?? 'unmatched'
    };

    tenantItems.set(normalizedItem.id, normalizedItem);
    if (normalizedItem.status === 'unmatched') {
      tenantUnmatchedIds.add(normalizedItem.id);
    } else {
      tenantUnmatchedIds.delete(normalizedItem.id);
    }

    this.itemsByTenant.set(item.tenant_id, tenantItems);
    this.unmatchedItemIdsByTenant.set(item.tenant_id, tenantUnmatchedIds);
    return normalizedItem;
  }

  findItem(tenantId: string, itemId: string): ReconciliationItem | null {
    const tenantItems = this.itemsByTenant.get(tenantId);
    if (!tenantItems) {
      return null;
    }

    return tenantItems.get(itemId) ?? null;
  }

  listUnmatchedItems(tenantId: string, sourceType?: string, limit = 100): ReconciliationItem[] {
    const tenantItems = this.itemsByTenant.get(tenantId);
    const tenantUnmatchedIds = this.unmatchedItemIdsByTenant.get(tenantId);
    if (!tenantItems || !tenantUnmatchedIds) {
      return [];
    }

    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const result: ReconciliationItem[] = [];

    for (const itemId of tenantUnmatchedIds) {
      const item = tenantItems.get(itemId);
      if (!item) {
        continue;
      }

      if (sourceType && item.source_type !== sourceType) {
        continue;
      }

      result.push(item);
      if (result.length >= boundedLimit) {
        break;
      }
    }

    return result.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  }

  createManualMatch(
    tenantId: string,
    match: Omit<ReconciliationMatch, 'tenant_id' | 'match_type'>
  ): ReconciliationMatch {
    const tenantMatches = this.matchesByTenant.get(tenantId) ?? new Map<string, ReconciliationMatch>();
    const tenantMatchIndex = this.matchIdsByItemKey.get(tenantId) ?? new Map<string, Set<string>>();

    const createdMatch: ReconciliationMatch = {
      ...match,
      tenant_id: tenantId,
      match_type: 'manual'
    };

    tenantMatches.set(createdMatch.id, createdMatch);
    this.addMatchIdToItemIndex(tenantMatchIndex, createdMatch.left_item_id, createdMatch.id);
    this.addMatchIdToItemIndex(tenantMatchIndex, createdMatch.right_item_id, createdMatch.id);

    this.matchesByTenant.set(tenantId, tenantMatches);
    this.matchIdsByItemKey.set(tenantId, tenantMatchIndex);

    this.setItemStatus(tenantId, createdMatch.left_item_id, 'matched');
    this.setItemStatus(tenantId, createdMatch.right_item_id, 'matched');

    return createdMatch;
  }

  listMatches(tenantId: string, itemId?: string): ReconciliationMatch[] {
    const tenantMatches = this.matchesByTenant.get(tenantId);
    if (!tenantMatches) {
      return [];
    }

    if (!itemId) {
      return Array.from(tenantMatches.values()).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    }

    const tenantItemIndex = this.matchIdsByItemKey.get(tenantId);
    const matchIds = tenantItemIndex?.get(itemId);
    if (!matchIds) {
      return [];
    }

    const result: ReconciliationMatch[] = [];
    for (const matchId of matchIds) {
      const match = tenantMatches.get(matchId);
      if (match) {
        result.push(match);
      }
    }

    return result.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }

  private setItemStatus(tenantId: string, itemId: string, status: ReconciliationItemStatus): void {
    const tenantItems = this.itemsByTenant.get(tenantId);
    if (!tenantItems) {
      return;
    }

    const item = tenantItems.get(itemId);
    if (!item) {
      return;
    }

    const updated: ReconciliationItem = {
      ...item,
      status,
      updated_at: new Date().toISOString()
    };
    tenantItems.set(itemId, updated);

    const unmatchedSet = this.unmatchedItemIdsByTenant.get(tenantId) ?? new Set<string>();
    if (status === 'unmatched') {
      unmatchedSet.add(itemId);
    } else {
      unmatchedSet.delete(itemId);
    }

    this.unmatchedItemIdsByTenant.set(tenantId, unmatchedSet);
  }

  private addMatchIdToItemIndex(index: Map<string, Set<string>>, itemId: string, matchId: string): void {
    const ids = index.get(itemId) ?? new Set<string>();
    ids.add(matchId);
    index.set(itemId, ids);
  }
}
