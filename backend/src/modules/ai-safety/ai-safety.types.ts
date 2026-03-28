export type AiSafetyIntent = 'lookup' | 'summarize' | 'extract';

export interface VerifiedSource {
  id: string;
  title: string;
  uri: string;
  verified: boolean;
  published_at?: string;
  retrieved_at?: string;
  trust_tier: 'primary' | 'internal_audit' | 'regulatory';
}

export interface GroundedClaim {
  statement: string;
  source_ids: string[];
}

export interface GuardedQuery {
  prompt: string;
  intent: AiSafetyIntent;
  sources: VerifiedSource[];
  claims: GroundedClaim[];
  allow_unverified?: boolean;
}

export interface GuardedResponse {
  status: 'accepted' | 'rejected';
  reason: string | null;
  grounded_claims: GroundedClaim[];
  source_manifest: VerifiedSource[];
}
