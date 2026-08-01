// AOSSIE Relay SDK
// A zero-dependency TypeScript client for any AOSSIE Relay Server.

export { RelayClient } from "./client";

export type {
  Message,
  SendParams,
  ClientOptions,
  PollOptions,
  HealthResponse,
} from "./types";

export {
  RelayError,
  RelayNetworkError,
  RelayRateLimitError,
  RelayNotFoundError,
  RelayPayloadTooLargeError,
  RelayUnauthorizedError,
} from "./errors";
