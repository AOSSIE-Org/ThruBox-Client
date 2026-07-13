/**
 * Base error class for all relay SDK errors.
 */
export class RelayError extends Error {
  /** HTTP status code from the relay server, if applicable */
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "RelayError";
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a network error occurs (e.g., fetch fails, DNS resolution fails).
 * This error is NOT caused by an HTTP response — the request never completed.
 */
export class RelayNetworkError extends RelayError {
  constructor(message: string) {
    super(message, 0);
    this.name = "RelayNetworkError";
  }
}

/**
 * Thrown when the relay returns 429 Too Many Requests.
 * Includes the Retry-After value if provided by the server.
 */
export class RelayRateLimitError extends RelayError {
  /** Number of seconds to wait before retrying, from the Retry-After header */
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, 429);
    this.name = "RelayRateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when the relay returns 404 Not Found.
 */
export class RelayNotFoundError extends RelayError {
  constructor(message: string) {
    super(message, 404);
    this.name = "RelayNotFoundError";
  }
}

/**
 * Thrown when the relay returns 413 Payload Too Large.
 */
export class RelayPayloadTooLargeError extends RelayError {
  constructor() {
    super("Payload too large", 413);
    this.name = "RelayPayloadTooLargeError";
  }
}

/**
 * Thrown when the relay returns 401 Unauthorized (invalid or missing API key).
 */
export class RelayUnauthorizedError extends RelayError {
  constructor() {
    super("Unauthorized: invalid or missing API key", 401);
    this.name = "RelayUnauthorizedError";
  }
}
