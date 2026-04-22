export class HttpError extends Error {
  readonly status: number;
  readonly body: Record<string, any>;

  constructor(status: number, body: Record<string, any>) {
    super(typeof body.error === 'string' ? body.error : `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}
