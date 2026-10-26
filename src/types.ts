/**
 * Represents an encrypted message stored in the relay.
 * The payload is opaque to the relay — all encryption/decryption happens client-side.
 */
export interface Message {
  /**
   * Message ID, assigned by the relay server. Treat it as an opaque string.
   * Current servers derive it from the message content (hex SHA-256 of
   * to, from and payload); older servers used a UUID.
   */
  id: string;
  /**
   * Position in the recipient's mailbox (1, 2, 3, ...), assigned by the
   * relay server. Only ever increases and is never reused. Pass the highest
   * one you have handled as `after` to fetch only newer messages.
   * Undefined when talking to a server that predates sequence numbers.
   */
  seq?: number;
  /** Recipient wallet address */
  to: string;
  /** Sender wallet address */
  from: string;
  /** Encrypted data (base64 string, opaque to server) */
  payload: string;
  /** ISO 8601 timestamp when message was stored */
  createdAt: string;
  /** ISO 8601 timestamp when message will be auto-purged, or null if stored forever */
  expiresAt: string | null;
}

/**
 * Parameters for sending a message via the relay.
 */
export interface SendParams {
  /** Recipient wallet address */
  to: string;
  /** Sender wallet address */
  from: string;
  /** Encrypted payload (base64 string) */
  payload: string;
}

/**
 * Options for the receive() method.
 */
export interface ReceiveOptions {
  /** Only return messages whose `seq` is greater than this. */
  after?: number;
  /** Return at most this many messages (1 to 1000 on the reference server). */
  limit?: number;
}

/**
 * Configuration options for the RelayClient.
 */
export interface ClientOptions {
  /** API key for authenticated relay servers. Sent as X-API-Key header. */
  apiKey?: string;
  /** Request timeout in milliseconds. Default: 10000 (10 seconds) */
  timeout?: number;
  /** Number of retry attempts on network errors / 5xx responses. Default: 3 */
  retries?: number;
}

/**
 * Options for the poll() method.
 */
export interface PollOptions {
  /** Polling interval in milliseconds. Default: 10000 (10 seconds) */
  intervalMs?: number;
  /** Optional callback for handling polling or network errors */
  onError?: (error: Error) => void;
  /**
   * Turns on cursor tracking. Each poll asks only for messages with a `seq`
   * greater than the cursor, starting from this value (use 0 for the whole
   * mailbox, or a saved `seq` to resume). After the callback finishes without
   * throwing, the cursor moves to the highest `seq` it was given; if it throws
   * or rejects, the same messages are delivered again on the next poll.
   *
   * Omitted, every poll returns the whole mailbox, as before.
   */
  after?: number;
}

/**
 * Health check response from the relay server.
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
}
