import type {
  Message,
  SendParams,
  ClientOptions,
  PollOptions,
  HealthResponse,
} from "./types";
import {
  RelayError,
  RelayNetworkError,
  RelayRateLimitError,
  RelayNotFoundError,
  RelayPayloadTooLargeError,
  RelayUnauthorizedError,
} from "./errors";

const DEFAULT_TIMEOUT = 10_000; // 10 seconds
const DEFAULT_RETRIES = 3;
const DEFAULT_POLL_INTERVAL = 10_000; // 10 seconds

/**
 * Client for interacting with an AOSSIE Relay Server.
 *
 * @example
 * ```typescript
 * const relay = new RelayClient('https://relay.aossie.org');
 *
 * // Send an encrypted message
 * await relay.send({ to: '0xRecipient', from: '0xSender', payload: encryptedData });
 *
 * // Receive messages
 * const messages = await relay.receive('0xMyWallet');
 *
 * // Poll for new messages
 * const stop = relay.poll('0xMyWallet', (msgs) => console.log(msgs));
 * // Later: stop();
 * ```
 */
export class RelayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly retries: number;

  /**
   * Create a new RelayClient pointing to any relay server.
   *
   * @param baseUrl - The URL of the relay server (e.g., 'https://relay.aossie.org')
   * @param options - Optional configuration (API key, timeout, retries)
   */
  constructor(baseUrl: string, options?: ClientOptions) {
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Invalid base URL protocol. Must be http: or https:");
      }
      this.baseUrl = parsedUrl.toString().replace(/\/+$/, "");
    } catch (err) {
      throw new Error(`Invalid base URL: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.apiKey = options?.apiKey;
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options?.retries ?? DEFAULT_RETRIES;

    if (this.timeout <= 0 || !Number.isFinite(this.timeout)) {
      throw new Error("Timeout must be a positive finite number");
    }
    if (this.retries < 0 || !Number.isInteger(this.retries)) {
      throw new Error("Retries must be a non-negative integer");
    }
  }

  /**
   * Send an encrypted message through the relay.
   *
   * @param params - The message to send (to, from, payload)
   * @returns The stored message with server-generated ID and timestamps
   * @throws {RelayPayloadTooLargeError} If the payload exceeds the server's max size
   * @throws {RelayRateLimitError} If the rate limit is exceeded
   * @throws {RelayUnauthorizedError} If an API key is required but missing/invalid
   */
  async send(params: SendParams): Promise<Message> {
    const response = await this.request<Message>("/api/messages", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return response;
  }

  /**
   * Fetch all messages addressed to a wallet address.
   *
   * @param address - The recipient wallet address to fetch messages for
   * @returns An array of messages (empty array if none)
   */
  async receive(address: string): Promise<Message[]> {
    return this.request<Message[]>(
      `/api/messages/${encodeURIComponent(address)}`,
    );
  }

  /**
   * Delete a specific message by its ID.
   *
   * @param id - The UUID of the message to delete
   */
  async delete(id: string): Promise<void> {
    await this.request<void>(`/api/messages/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  /**
   * Check the health of the relay server.
   *
   * @returns Health status and server timestamp
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  /**
   * Poll the relay for new messages at a regular interval.
   * Returns a stop function that cancels the polling.
   *
   * @param address - The wallet address to poll for
   * @param callback - Called with new messages on each poll cycle
   * @param options - Polling configuration (interval)
   * @returns A function that stops polling when called
   *
   * @example
   * ```typescript
   * const stop = relay.poll('0xMyWallet', (messages) => {
   *   console.log('New messages:', messages);
   * }, { intervalMs: 5000 });
   *
   * // Later: stop polling
   * stop();
   * ```
   */
  poll(
    address: string,
    callback: (messages: Message[]) => void,
    options?: PollOptions,
  ): () => void {
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL;
    if (intervalMs <= 0 || !Number.isFinite(intervalMs)) {
      throw new Error("Polling interval must be a positive finite number");
    }

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const doPoll = async (): Promise<void> => {
      if (stopped) return;

      let messages: Message[] | undefined;
      try {
        messages = await this.receive(address);
      } catch (err) {
        if (!stopped) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (options?.onError) {
            options.onError(error);
          } else {
            console.error("RelayClient polling error:", error);
          }
        }
      }

      if (!stopped && messages) {
        callback(messages);
      }

      if (!stopped) {
        timeoutId = setTimeout(doPoll, intervalMs);
      }
    };

    // Run the first poll immediately
    doPoll();

    // Return stop function
    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }

  /**
   * Internal method that performs HTTP requests with retry logic.
   * Handles error mapping, timeouts, and exponential backoff.
   */
  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {};
    if (init?.method === "POST" || init?.method === "PUT" || init?.method === "PATCH") {
      headers["Content-Type"] = "application/json";
    }

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const maxRetries = init?.method === "POST" ? 0 : this.retries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            ...init,
            headers: { ...headers, ...init?.headers },
            signal: controller.signal,
          });

          // Handle success (2xx)
          if (response.ok) {
            // 204 No Content (e.g., DELETE)
            if (response.status === 204) {
              return undefined as T;
            }
            return (await response.json()) as T;
          }

          // Handle specific error codes (no retry)
          if (response.status === 401) {
            throw new RelayUnauthorizedError();
          }

          if (response.status === 404) {
            const text = await response.text();
            throw new RelayNotFoundError(text || "Not found");
          }

          if (response.status === 413) {
            throw new RelayPayloadTooLargeError();
          }

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get("Retry-After");
            let retryAfter = 60;
            if (retryAfterHeader) {
              const parsedNum = Number(retryAfterHeader);
              if (!Number.isNaN(parsedNum)) {
                retryAfter = parsedNum;
              } else {
                const date = new Date(retryAfterHeader).getTime();
                if (!isNaN(date)) {
                  retryAfter = Math.max(0, Math.ceil((date - Date.now()) / 1000));
                }
              }
            }
            throw new RelayRateLimitError(retryAfter);
          }

          // 4xx errors (no retry)
          if (response.status >= 400 && response.status < 500) {
            const text = await response.text();
            throw new RelayError(text || `Request failed`, response.status);
          }

          // 5xx errors — retry with backoff
          lastError = new RelayError(
            `Server error: ${response.status}`,
            response.status,
          );
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        // If it's one of our typed errors, don't retry (except 5xx which are handled above)
        if (error instanceof RelayError && error.statusCode !== 0 && error.statusCode < 500) {
          throw error;
        }

        // Network error or abort — wrap and potentially retry
        if (error instanceof DOMException && error.name === "AbortError") {
          lastError = new RelayNetworkError("Request timed out");
        } else if (error instanceof RelayError) {
          lastError = error;
        } else if (error instanceof Error) {
          lastError = new RelayNetworkError(error.message);
        } else {
          lastError = new RelayNetworkError("Unknown error");
        }
      }

      // Exponential backoff before retry (1s, 2s, 4s, ...)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }

    throw lastError ?? new RelayNetworkError("Request failed after retries");
  }
}
