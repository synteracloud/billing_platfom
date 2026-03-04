export interface CursorMeta {
  next: string | null;
  prev: string | null;
  has_more: boolean;
}

export interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
    cursor?: CursorMeta;
  };
  error: null;
}
