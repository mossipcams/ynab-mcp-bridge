import { afterEach, describe, expect, it, vi } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

describe("startHttpServer managed path caching", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }

    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function sendJsonRpcRequest(url: string, body: Record<string, unknown>) {
    return await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify(body),
    });
  }

  it("reuses discovery resource summaries across sequential managed requests", async () => {
    let discoverySummaryCallCount = 0;

    vi.doMock("./serverRuntime.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./serverRuntime.js")>();

      return {
        ...actual,
        getDiscoveryResourceSummaries: vi.fn((...args: Parameters<typeof actual.getDiscoveryResourceSummaries>) => {
          discoverySummaryCallCount += 1;
          return actual.getDiscoveryResourceSummaries(...args);
        }),
      };
    });

    const { startHttpServer } = await import("./httpTransport.js");
    const server = await startHttpServer({
      ynab: {
        apiToken: "test-token",
      },
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => server.close());

    const initializeResponse = await sendJsonRpcRequest(server.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "managed-path-cache-client",
          version: "1.0.0",
        },
      },
    });
    const toolsListResponse = await sendJsonRpcRequest(server.url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(initializeResponse.status).toBe(200);
    expect(await initializeResponse.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
    });
    expect(toolsListResponse.status).toBe(200);
    expect(await toolsListResponse.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
    });
    expect(discoverySummaryCallCount).toBe(1);
  });
});
