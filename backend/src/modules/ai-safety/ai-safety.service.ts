import { BadRequestException } from '@nestjs/common';
import { GuardedQuery, GuardedResponse, GroundedClaim, VerifiedSource } from './ai-safety.types';

const UNSAFE_PATTERNS: RegExp[] = [
  /ignore\s+all\s+instructions/i,
  /override\s+safety/i,
  /bypass\s+policy/i,
  /exfiltrat(e|ion)/i,
  /fabricat(e|ed|ion)/i,
  /hallucinat(e|ion)/i
];

const UNVERIFIED_PATTERNS: RegExp[] = [
  /guess/i,
  /make\s+it\s+up/i,
  /no\s+source/i,
  /unverified/i,
  /speculat(e|ion)/i
];

export class AiSafetyService {
  validateAndGround(query: GuardedQuery): GuardedResponse {
    this.assertPrompt(query.prompt);
    this.assertAllowedIntent(query.intent);
    this.assertNoUnsafePatterns(query.prompt);
    this.assertNoUnverifiedInstructions(query.prompt, query.allow_unverified ?? false);

    const verifiedSources = this.validateSources(query.sources);
    const groundedClaims = this.validateClaims(query.claims, verifiedSources);

    return {
      status: 'accepted',
      reason: null,
      grounded_claims: groundedClaims,
      source_manifest: verifiedSources
    };
  }

  reject(reason: string): GuardedResponse {
    return {
      status: 'rejected',
      reason,
      grounded_claims: [],
      source_manifest: []
    };
  }

  private assertPrompt(prompt: string): void {
    if (!prompt || !prompt.trim()) {
      throw new BadRequestException('Prompt is required');
    }
    if (prompt.trim().length < 12) {
      throw new BadRequestException('Prompt is too short to safely ground');
    }
  }

  private assertAllowedIntent(intent: string): void {
    if (!['lookup', 'summarize', 'extract'].includes(intent)) {
      throw new BadRequestException(`Unsupported intent: ${intent}. Free-form computation is disallowed.`);
    }
  }

  private assertNoUnsafePatterns(prompt: string): void {
    if (UNSAFE_PATTERNS.some((pattern) => pattern.test(prompt))) {
      throw new BadRequestException('Unsafe query detected and blocked by safety wrapper');
    }
  }

  private assertNoUnverifiedInstructions(prompt: string, allowUnverified: boolean): void {
    if (allowUnverified) {
      throw new BadRequestException('allow_unverified is forbidden for production guarded flows');
    }
    if (UNVERIFIED_PATTERNS.some((pattern) => pattern.test(prompt))) {
      throw new BadRequestException('Unverified query instruction detected and rejected');
    }
  }

  private validateSources(sources: VerifiedSource[]): VerifiedSource[] {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new BadRequestException('At least one verified source is required');
    }

    const invalid = sources.find((source) => {
      if (!source.verified) {
        return true;
      }
      if (!source.id?.trim() || !source.title?.trim() || !source.uri?.trim()) {
        return true;
      }
      if (!['primary', 'internal_audit', 'regulatory'].includes(source.trust_tier)) {
        return true;
      }
      return false;
    });

    if (invalid) {
      throw new BadRequestException('All sources must be verified and include id/title/uri/trust tier');
    }

    const ids = new Set<string>();
    for (const source of sources) {
      if (ids.has(source.id)) {
        throw new BadRequestException(`Duplicate source id: ${source.id}`);
      }
      ids.add(source.id);
    }

    return sources.map((source) => Object.freeze({ ...source }));
  }

  private validateClaims(claims: GroundedClaim[], sources: VerifiedSource[]): GroundedClaim[] {
    if (!Array.isArray(claims) || claims.length === 0) {
      throw new BadRequestException('At least one grounded claim is required');
    }

    const sourceIds = new Set(sources.map((source) => source.id));

    return claims.map((claim) => {
      if (!claim.statement?.trim()) {
        throw new BadRequestException('Each claim must include a statement');
      }
      if (!Array.isArray(claim.source_ids) || claim.source_ids.length === 0) {
        throw new BadRequestException('Each claim must map to one or more verified source_ids');
      }
      for (const sourceId of claim.source_ids) {
        if (!sourceIds.has(sourceId)) {
          throw new BadRequestException(`Claim references unknown source_id: ${sourceId}`);
        }
      }
      return Object.freeze({
        statement: claim.statement.trim(),
        source_ids: Array.from(new Set(claim.source_ids))
      });
    });
  }
}
