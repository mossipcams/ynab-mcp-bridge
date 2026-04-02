import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "./httpTransport.js";

describe("http server structure", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("keeps HTTP request validation, parsing, and MCP handoff on the transport endpoint", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const headers = new Headers({
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Origin: "https://claude.ai",
      "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    });
    headers.append("Mcp-Session-Id", "session-one");
    headers.append("Mcp-Session-Id", "session-two");

    const invalidSessionResponse = await fetch(httpServer.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(invalidSessionResponse.status).toBe(400);
    await expect(invalidSessionResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Mcp-Session-Id header must be a single value",
      },
      id: null,
    });

    const initializeResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "structure-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.headers.get("mcp-session-id")).toBeNull();
  });

  it("serves direct discovery resources without legacy alias rewrite behavior", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const directResourceResponse = await fetch(new URL("/mcp/resources/ynab_get_mcp_version", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(directResourceResponse.status).toBe(200);
    await expect(directResourceResponse.json()).resolves.toMatchObject({
      toolName: "ynab_get_mcp_version",
      uri: `${httpServer.url}/resources/ynab_get_mcp_version`,
    });

    const missingResourceResponse = await fetch(new URL("/mcp/resources/missing-tool", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(missingResourceResponse.status).toBe(404);
    await expect(missingResourceResponse.json()).resolves.toEqual({
      error: "Not found",
    });
  });
});
