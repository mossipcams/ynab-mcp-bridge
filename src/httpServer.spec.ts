import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startHttpServer } from "./httpServer.js";

describe("startHttpServer", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      YNAB_API_TOKEN: "test-token",
    };
  });

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }

    process.env = { ...originalEnv };
  });

  it("serves MCP over authless streamable HTTP", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
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
      allowedOrigins: ["https://claude.ai"],
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
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")).toContain("mcp-session-id");
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");
  });

  it("adds CORS headers to MCP responses", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
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

  it("does not expose OAuth protected resource metadata for path-aware probing on an authless server", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("does not expose OAuth protected resource metadata at the root well-known endpoint on an authless server", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("still applies origin validation to path-aware probing URLs", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        Origin: "https://evil.example",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden origin",
    });
  });

  it("ignores forwarded headers on probing URLs because authless servers do not advertise OAuth resource metadata", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "0.0.0.0",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        "X-Forwarded-Host": "bridge.example.com",
        "X-Forwarded-Proto": "https",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("rejects requests from untrusted origins", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden origin",
    });
  });

  it("rejects authless probing URLs from untrusted origins before returning 404", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        Origin: "https://evil.example",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden origin",
    });
  });

  it("returns 405 for authless GET requests to the MCP endpoint", async () => {
    const httpServer = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  it("returns 404 for non-MCP paths", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/health", httpServer.url));

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("lets clients terminate a session and reconnect cleanly", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const firstClient = new Client({
      name: "ynab-mcp-bridge-test-1",
      version: "1.0.0",
    });
    const firstTransport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await firstClient.connect(firstTransport);
    const firstSessionId = firstTransport.sessionId;

    expect(firstSessionId).toBeTruthy();

    await firstTransport.terminateSession();

    const secondClient = new Client({
      name: "ynab-mcp-bridge-test-2",
      version: "1.0.0",
    });
    const secondTransport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await secondClient.connect(secondTransport);

    expect(secondTransport.sessionId).toBeTruthy();
    expect(secondTransport.sessionId).not.toBe(firstSessionId);

    await firstClient.close();
    await secondClient.close();
  });

  it("returns a client error for malformed JSON without breaking later requests", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const invalidResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: "{",
    });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.headers.get("access-control-allow-origin")).toBe("*");

    const client = new Client({
      name: "ynab-mcp-bridge-test-recovery",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await client.connect(transport);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toContain("ynab_list_plans");

    await client.close();
  });
});
