import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { startHttpServer } from "./httpServer.js";

describe("startHttpServer", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });

  it("serves MCP over authless streamable HTTP", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const client = new Client({
      name: "ynab-mcp-bridge-test",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await client.connect(transport);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toContain("ynab_list_plans");
    expect(result.tools.map((tool) => tool.name)).toContain("ynab_get_mcp_version");

    await transport.close();
  });

  it("supports browser preflight requests", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,mcp-session-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")).toContain("mcp-session-id");
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");
  });

  it("adds CORS headers to MCP responses", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Origin: "https://claude.ai",
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
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
            name: "browser-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");
  });
});
