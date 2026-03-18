export type IdempotencyStatus = 'in_progress' | 'completed';

export interface StoredHttpResponse {
  status_code: number;
  body: unknown;
}

export interface IdempotencyKeyEntity {
  key: string;
  scope: string;
  status: IdempotencyStatus;
  response_hash: string | null;
  created_at: string;
  response: StoredHttpResponse | null;
}
