import { Injectable } from '@nestjs/common';
import { ChartOfAccountsRepository } from './chart-of-accounts.repository';
import { DEFAULT_CHART_OF_ACCOUNTS, POSTING_RULE_EXPECTATIONS } from './chart-of-accounts.defaults';
import { AccountDefinition, ChartValidationResult, PostingRuleExpectation, TenantAccount } from './entities/chart-of-account.entity';

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly repository: ChartOfAccountsRepository) {}

  initializeForTenant(tenantId: string, extensions: AccountDefinition[] = []): TenantAccount[] {
    const existing = this.repository.findByTenant(tenantId);
    if (existing.length > 0) {
      return existing;
    }

    const definitions = this.mergeDefinitions(DEFAULT_CHART_OF_ACCOUNTS, extensions);
    return this.repository.replaceForTenant(tenantId, definitions);
  }

  listForTenant(tenantId: string): TenantAccount[] {
    return this.repository.findByTenant(tenantId);
  }

  validateTenantChart(tenantId: string): ChartValidationResult {
    return this.validateDefinitions(this.repository.findByTenant(tenantId), POSTING_RULE_EXPECTATIONS);
  }

  validateDefinitions(
    definitions: AccountDefinition[],
    postingRules: PostingRuleExpectation[] = POSTING_RULE_EXPECTATIONS
  ): ChartValidationResult {
    const duplicateKeys = this.findDuplicates(definitions.map((account) => account.key));
    const duplicateCodes = this.findDuplicates(definitions.map((account) => account.code));
    const index = new Map(definitions.map((definition) => [definition.key, definition]));
    const missingAccounts = new Set<string>();
    const uncoveredFlows: string[] = [];
    const misclassifiedAccounts: Array<{ key: string; expected: PostingRuleExpectation['requiredAccounts'][number]['allowedTypes']; actual: AccountDefinition['type'] }> = [];

    for (const postingRule of postingRules) {
      let flowCovered = true;
      for (const accountRequirement of postingRule.requiredAccounts) {
        const account = index.get(accountRequirement.key);
        if (!account) {
          missingAccounts.add(accountRequirement.key);
          flowCovered = false;
          continue;
        }

        if (!accountRequirement.allowedTypes.includes(account.type)) {
          misclassifiedAccounts.push({
            key: accountRequirement.key,
            expected: accountRequirement.allowedTypes,
            actual: account.type
          });
          flowCovered = false;
        }
      }

      if (!flowCovered) {
        uncoveredFlows.push(postingRule.eventType);
      }
    }

    return {
      valid:
        duplicateKeys.length === 0 &&
        duplicateCodes.length === 0 &&
        missingAccounts.size === 0 &&
        misclassifiedAccounts.length === 0 &&
        uncoveredFlows.length === 0,
      duplicateKeys,
      duplicateCodes,
      missingAccounts: [...missingAccounts],
      misclassifiedAccounts,
      uncoveredFlows
    };
  }

  private mergeDefinitions(baseDefinitions: AccountDefinition[], extensions: AccountDefinition[]): AccountDefinition[] {
    return [...baseDefinitions, ...extensions].reduce<AccountDefinition[]>((merged, candidate) => {
      const existingIndex = merged.findIndex((definition) => definition.key === candidate.key);
      if (existingIndex === -1) {
        merged.push(candidate);
        return merged;
      }

      merged[existingIndex] = {
        ...merged[existingIndex],
        ...candidate,
        system: merged[existingIndex].system && candidate.system
      };
      return merged;
    }, []);
  }

  private findDuplicates(values: string[]): string[] {
    const counts = values.reduce<Map<string, number>>((accumulator, value) => {
      accumulator.set(value, (accumulator.get(value) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>());

    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
      .sort();
  }
}
