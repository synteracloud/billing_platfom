export interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}
