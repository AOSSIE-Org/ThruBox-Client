import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelayClient } from "../src/client";
import {
  RelayError,
  RelayNetworkError,
  RelayRateLimitError,
  RelayPayloadTooLargeError,
  RelayUnauthorizedError,
} from "../src/errors";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status: number, headers?: Record<string, string>): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain", ...headers },
  });
}

describe("RelayClient", () => {
  let client: RelayClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RelayClient("http://localhost:3000", { retries: 0 });
  });

  // --- send() ---

  describe("send()", () => {
    it("should send a message and return the stored message", async () => {
      const mockMessage = {
        id: "abc-123",
        to: "0xRecipient",
        from: "0xSender",
        payload: "encrypted_data",
        createdAt: "2025-01-01T00:00:00Z",
        expiresAt: "2025-01-08T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(mockMessage, 201));

      const result = await client.send({
        to: "0xRecipient",
        from: "0xSender",
        payload: "encrypted_data",
      });

      expect(result).toEqual(mockMessage);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:3000/api/messages");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        to: "0xRecipient",
        from: "0xSender",
        payload: "encrypted_data",
      });
    });

    it("should throw RelayPayloadTooLargeError on 413", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("payload too large", 413));

      await expect(
        client.send({ to: "0x1", from: "0x2", payload: "huge_data" }),
      ).rejects.toThrow(RelayPayloadTooLargeError);
    });
  });

  // --- receive() ---

  describe("receive()", () => {
    it("should fetch messages for an address", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          to: "0xWallet",
          from: "0xSender",
          payload: "data1",
          createdAt: "2025-01-01T00:00:00Z",
          expiresAt: null,
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse(mockMessages));

      const result = await client.receive("0xWallet");

      expect(result).toEqual(mockMessages);
      expect(mockFetch.mock.calls[0][0]).toBe(
        "http://localhost:3000/api/messages/0xWallet",
      );
    });

    it("should return empty array when no messages exist", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.receive("0xEmpty");
      expect(result).toEqual([]);
    });

    it("should encode address in URL", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await client.receive("addr with spaces");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "http://localhost:3000/api/messages/addr%20with%20spaces",
      );
    });
  });

  // --- delete() ---

  describe("delete()", () => {
    it("should delete a message by ID", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      );

      await client.delete("msg-123");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:3000/api/messages/msg-123");
      expect(init.method).toBe("DELETE");
    });
  });

  // --- health() ---

  describe("health()", () => {
    it("should return server health status", async () => {
      const mockHealth = { status: "ok", timestamp: "2025-01-01T00:00:00Z" };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockHealth));

      const result = await client.health();

      expect(result).toEqual(mockHealth);
      expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:3000/health");
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("should throw RelayUnauthorizedError on 401", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("unauthorized", 401));

      await expect(client.receive("0x1")).rejects.toThrow(
        RelayUnauthorizedError,
      );
    });

    it("should throw RelayRateLimitError on 429 with Retry-After", async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse("rate limited", 429, { "Retry-After": "30" }),
      );

      expect.assertions(2);
      try {
        await client.receive("0x1");
      } catch (e) {
        expect(e).toBeInstanceOf(RelayRateLimitError);
        expect((e as RelayRateLimitError).retryAfter).toBe(30);
      }
    });

    it("should throw RelayNotFoundError on 404", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("message not found", 404));

      await expect(client.delete("msg-123")).rejects.toThrow("message not found");
    });

    it("should throw RelayError on other 4xx errors", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad request", 400));

      await expect(client.receive("0x1")).rejects.toThrow(RelayError);
    });

    it("should handle timeout cancellation (AbortError)", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(client.receive("0x1")).rejects.toThrow(/Request timed out/);
    });

    it("should throw RelayNetworkError on fetch failure", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(client.receive("0x1")).rejects.toThrow(RelayNetworkError);
    });
  });

  // --- Retry logic ---

  describe("retry logic", () => {
    it("should retry on 5xx errors with exponential backoff", async () => {
      vi.useFakeTimers();
      try {
        const retryClient = new RelayClient("http://localhost:3000", {
          retries: 2,
        });

        const mockMessages = [{ id: "1", to: "0x1", from: "0x2", payload: "p", createdAt: "t", expiresAt: null }];

        // Fail twice, succeed on third
        mockFetch
          .mockResolvedValueOnce(textResponse("server error", 500))
          .mockResolvedValueOnce(textResponse("server error", 502))
          .mockResolvedValueOnce(jsonResponse(mockMessages));

        const promise = retryClient.receive("0x1");
        
        // 1st attempt fails, waits 1000ms
        await vi.advanceTimersByTimeAsync(1050);
        // 2nd attempt fails, waits 2000ms
        await vi.advanceTimersByTimeAsync(2050);

        const result = await promise;
        expect(result).toEqual(mockMessages);
        expect(mockFetch).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should NOT retry on 4xx errors", async () => {
      const retryClient = new RelayClient("http://localhost:3000", {
        retries: 2,
      });

      mockFetch.mockResolvedValueOnce(textResponse("bad request", 400));

      await expect(retryClient.receive("0x1")).rejects.toThrow(RelayError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --- API Key ---

  describe("API key", () => {
    it("should include X-API-Key header when configured", async () => {
      const authClient = new RelayClient("http://localhost:3000", {
        apiKey: "my-secret-key",
        retries: 0,
      });

      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await authClient.receive("0x1");

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["X-API-Key"]).toBe("my-secret-key");
    });

    it("should NOT include X-API-Key header when not configured", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await client.receive("0x1");

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["X-API-Key"]).toBeUndefined();
    });
  });

  // --- poll() ---

  describe("poll()", () => {
    it("should call callback with messages and stop when stop() is called", async () => {
      vi.useFakeTimers();

      try {
        const mockMessages = [
          { id: "1", to: "0x1", from: "0x2", payload: "p", createdAt: "t", expiresAt: null },
        ];

        // Return a fresh Response each call (Response body can only be consumed once)
        mockFetch.mockImplementation(() =>
          Promise.resolve(jsonResponse(mockMessages)),
        );

        const callback = vi.fn();
        const stop = client.poll("0x1", callback, { intervalMs: 1000 });

        // Flush the first immediate poll (microtask)
        await vi.advanceTimersByTimeAsync(50);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(mockMessages);

        // Advance past the interval to trigger second poll + flush
        await vi.advanceTimersByTimeAsync(1050);

        expect(callback).toHaveBeenCalledTimes(2);

        // Stop polling
        stop();

        // Advance again — should NOT trigger another poll
        await vi.advanceTimersByTimeAsync(3000);
        expect(callback).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // --- Validation & URL handling ---

  describe("validation and URL handling", () => {
    it("should strip trailing slashes from base URL", () => {
      const slashClient = new RelayClient("http://localhost:3000///", {
        retries: 0,
      });
      expect((slashClient as any).baseUrl).toBe("http://localhost:3000");
    });

    it("should throw on invalid URL protocol", () => {
      expect(() => new RelayClient("ftp://localhost")).toThrow("Invalid base URL");
    });

    it("should throw on invalid timeout or retries", () => {
      expect(() => new RelayClient("http://localhost", { timeout: -1 })).toThrow("Timeout must be a positive");
      expect(() => new RelayClient("http://localhost", { retries: -1 })).toThrow("Retries must be a non-negative integer");
    });
  });
});
