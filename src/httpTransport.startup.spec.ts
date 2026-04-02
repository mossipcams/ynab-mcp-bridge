import { createServer as createNodeHttpServer } from "node:http";

import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "./httpTransport.js";

describe("startHttpServer startup sequencing", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
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

  it("accepts initialize requests as soon as the server is ready to receive MCP POSTs", async () => {
    const port = await getFreePort();
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
