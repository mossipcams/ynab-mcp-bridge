import { createServer as createNodeHttpServer } from "node:http";

import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fastPathDelayMs = 0;

vi.mock("./serverRuntime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./serverRuntime.js")>();

  return {
    ...actual,
    createFastPathToolCallResults: vi.fn(async () => {
      if (fastPathDelayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, fastPathDelayMs);
        });
      }

      return await actual.createFastPathToolCallResults();
    }),
  };
});

describe("startHttpServer startup sequencing", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const originalEnv = process.env;
  const ynab = {
    apiToken: "test-token",
  } as const;

  beforeEach(() => {
    fastPathDelayMs = 0;
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
    fastPathDelayMs = 0;
    vi.resetModules();

    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();

      if (cleanup) {
        await cleanup();
      }
    }
  });

  async function getFreePort() {
    const server = createNodeHttpServer();

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for free port probe.");
    }

    const { port } = address;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return port;
  }

  async function sendInitializeUntilConnected(url: string, timeoutMs: number) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        return await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            Origin: "https://claude.ai",
            "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: {
                name: "startup-race-client",
                version: "1.0.0",
              },
            },
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("fetch failed")) {
          throw error;
        }
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }

    throw new Error("Timed out waiting for HTTP server to accept startup request.");
  }

  it("does not fail early MCP POSTs while startup initialization is still pending", async () => {
    fastPathDelayMs = 150;
    const port = await getFreePort();
    const { startHttpServer } = await import("./httpTransport.js");
    const serverPromise = startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port,
      path: "/mcp",
    });

    const response = await sendInitializeUntilConnected(`http://127.0.0.1:${port}/mcp`, 500);
    const payload = await response.json();

    const httpServer = await serverPromise;
    cleanups.push(() => httpServer.close());

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
      },
    });
  });
});
