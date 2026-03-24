import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createServer as createNodeHttpServer, request as httpRequest } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startHttpServer } from "./httpServer.js";
import {
  approveAuthorizationConsent,
  createCloudflareOAuthAuth,
  createCodeChallenge,
  registerOAuthClient,
  startAuthorization,
  startUpstreamOAuthServer,
} from "./oauthTestHelpers.js";

describe("startHttpServer", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const originalEnv = process.env;
  const ynab = {
    apiToken: "test-token",
  } as const;

  function getStructuredLogEntry(call: unknown[]) {
    if (call.length !== 1 || typeof call[0] !== "string") {
      return undefined;
    }

    try {
      const parsed = JSON.parse(call[0]);
      return typeof parsed === "object" && parsed !== null
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }

  function findLogCall(
    spy: ReturnType<typeof vi.spyOn>,
    event: string,
    matcher: (details: Record<string, unknown>) => boolean = () => true,
  ) {
    return spy.mock.calls.find((call) => {
      const structuredEntry = getStructuredLogEntry(call);

      if (structuredEntry) {
        return structuredEntry.scope === "http" &&
          structuredEntry.event === event &&
          matcher(structuredEntry);
      }

      const [scope, loggedEvent, details] = call;

      return scope === "[http]" &&
        loggedEvent === event &&
        typeof details === "object" &&
        details !== null &&
        matcher(details as Record<string, unknown>);
    });
  }

  function findProfileLogCall(
    spy: ReturnType<typeof vi.spyOn>,
    event: string,
    matcher: (details: Record<string, unknown>) => boolean = () => true,
  ) {
    return spy.mock.calls.find(([scope, loggedEvent, details]) => (
      scope === "[profile]" &&
      loggedEvent === event &&
      typeof details === "object" &&
      details !== null &&
      matcher(details as Record<string, unknown>)
    ));
  }
  function findOAuthLogCall(
    spy: ReturnType<typeof vi.spyOn>,
    event: string,
    matcher: (details: Record<string, unknown>) => boolean = () => true,
  ) {
    return spy.mock.calls.find((call) => {
      const structuredEntry = getStructuredLogEntry(call);

      if (structuredEntry) {
        return structuredEntry.scope === "oauth" &&
          structuredEntry.event === event &&
          matcher(structuredEntry);
      }

      const [scope, loggedEvent, details] = call;

      return scope === "[oauth]" &&
        loggedEvent === event &&
        typeof details === "object" &&
        details !== null &&
        matcher(details as Record<string, unknown>);
    });
  }

  async function sendRawHttpRequest(url: string, options: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    path?: string;
  }) {
    const target = new URL(options.path ?? url, url);

    return await new Promise<{
      body: string;
      headers: Record<string, string | string[] | undefined>;
      statusCode: number | undefined;
    }>((resolve, reject) => {
      const request = httpRequest({
        host: target.hostname,
        method: options.method,
        path: `${target.pathname}${target.search}`,
        port: Number(target.port),
        headers: options.headers,
      }, (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      });

      request.on("error", reject);

      if (options.body) {
        request.write(options.body);
      }

      request.end();
    });
  }

  async function startJwksServer() {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);

    jwk.kid = "http-server-test-key";

    const server = createNodeHttpServer((req, res) => {
      if (req.url !== "/jwks") {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        keys: [jwk],
      }));
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("JWKS test server did not expose a TCP address");
    }

    const jwksUrl = `http://127.0.0.1:${address.port}/jwks`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    return {
      jwksUrl,
      privateKey,
    };
  }

  async function createOAuthTestToken(privateKey: CryptoKey, overrides: {
    aud?: string;
    iss?: string;
    scope?: string;
  } = {}) {
    return await new SignJWT({
      client_id: "client-123",
      scope: overrides.scope ?? "openid profile offline_access",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "http-server-test-key",
      })
      .setIssuedAt()
      .setIssuer(overrides.iss ?? "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123")
      .setAudience(overrides.aud ?? "https://mcp.example.com/mcp")
      .setExpirationTime("5 minutes")
      .setSubject("user-123")
      .sign(privateKey);
  }

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
      ynab,
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

  it("requires explicit YNAB config instead of reading environment during HTTP startup", async () => {
    await expect((async () => {
      let httpServer: Awaited<ReturnType<typeof startHttpServer>> | undefined;

      try {
        httpServer = await (startHttpServer as any)({
          host: "127.0.0.1",
          port: 0,
        });
      } finally {
        await httpServer?.close();
      }
    })()).rejects.toThrow("YNAB config is required.");
  });

  it("logs request ingress and session initialization details", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "User-Agent": "openai-mcp/1.0.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "logging-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(findLogCall(consoleErrorSpy, "request.received", (details) => (
      details.authMode === "none" &&
      details.method === "POST" &&
      details.path === "/mcp" &&
      details.origin === "https://claude.ai" &&
      details.userAgent === "chatgpt"
    ))).toBeTruthy();
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.authMode === "none" &&
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.jsonRpcMethod === "initialize" &&
      details.userAgent === "chatgpt" &&
      details.sessionId === undefined &&
      details.cleanup === false
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.profileId === "claude" &&
      details.reason === "origin:claude.ai"
    ))).toBeTruthy();
  });

  it("falls back to the generic client profile without changing stateless POST handling", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
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
            name: "generic-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.profileId === "generic" &&
      details.reason === "fallback:generic"
    ))).toBeTruthy();
  });

  it("logs a conservative profile reconciliation when initialize clientInfo disagrees with pre-auth detection", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(httpServer.url, {
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
            name: "OpenAI Codex",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(findProfileLogCall(consoleErrorSpy, "profile.reconciled", (details) => (
      details.path === "/mcp" &&
      details.provisionalProfileId === "claude" &&
      details.confirmedProfileId === "codex" &&
      details.profileId === "generic" &&
      details.reason === "reconciled:generic"
    ))).toBeTruthy();
  });

  it("detects Codex-style OAuth probe paths without changing authless 404 behavior", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(new URL("/.well-known/oauth-authorization-server/sse", httpServer.url), {
      headers: {
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(404);
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/.well-known/oauth-authorization-server/sse" &&
      details.method === "GET" &&
      details.profileId === "codex" &&
      details.reason === "path:codex-oauth-probe"
    ))).toBeTruthy();
  });

  it("supports browser preflight requests", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")).toContain("mcp-session-id");
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("adds CORS headers to MCP responses", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");
  });

  it("does not expose OAuth protected resource metadata for path-aware probing on an authless server", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("does not expose OAuth protected resource metadata at the root well-known endpoint on an authless server", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
  });

  it("still applies origin validation to path-aware probing URLs", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
      ynab,
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
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

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
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "forbidden-origin" &&
      details.origin === "https://evil.example"
    ))).toBeTruthy();
  });

  it("rejects invalid host headers when bound to localhost", async () => {
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await sendRawHttpRequest(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "evil.example",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(response.body)).toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: expect.stringContaining("Invalid Host"),
      },
      id: null,
    });
  });

  it("allows configured proxy host headers on loopback while still rejecting unknown hosts", async () => {
    const httpServer = await (startHttpServer as any)({
      ynab,
      allowedHosts: ["mcp.example.com"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const acceptedResponse = await sendRawHttpRequest(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "mcp.example.com",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(acceptedResponse.statusCode).toBe(200);

    const rejectedResponse = await sendRawHttpRequest(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "unexpected.example",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(rejectedResponse.statusCode).toBe(403);
    expect(JSON.parse(rejectedResponse.body)).toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: expect.stringContaining("Invalid Host"),
      },
      id: null,
    });
  });

  it("rejects authless probing URLs from untrusted origins before returning 404", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
      ynab,
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
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  it("returns 405 for GET requests even after initialization", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "get-stream-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.headers.get("mcp-session-id")).toBeTruthy();

    const streamResponse = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(streamResponse.status).toBe(405);
    expect(streamResponse.headers.get("allow")).toBe("POST, DELETE");
  });

  it("returns a JSON initialize response with an MCP session id", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
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
            name: "json-init-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("mcp-session-id")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: expect.any(Object),
    });
  });

  it("handles sessionless tools/call requests without a prior MCP session", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
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
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("mcp-session-id")).toBeNull();
    await expect(response.text()).resolves.toContain("\"content\"");
  });

  it("issues an MCP session id on initialize and accepts follow-up requests with that session id", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "stateful-session-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    const sessionId = initializeResponse.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const followUpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(followUpResponse.status).toBe(200);
    expect(followUpResponse.headers.get("mcp-session-id")).toBe(sessionId);
    await expect(followUpResponse.text()).resolves.toContain("\"ynab_get_mcp_version\"");
  });

  it("rejects unknown MCP session ids for non-initialize requests", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": "unknown-session-id",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Session not found",
      },
      id: null,
    });
  });

  it("expires idle MCP sessions and rejects follow-up requests after the timeout", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
      sessionIdleTimeoutMs: 25,
    } as Parameters<typeof startHttpServer>[0]);
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "idle-expiry-client",
            version: "1.0.0",
          },
        },
      }),
    });

    const sessionId = initializeResponse.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    const followUpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(followUpResponse.status).toBe(404);
    await expect(followUpResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Session not found",
      },
      id: null,
    });
  });

  it("terminates an issued MCP session with DELETE and rejects later requests for that session", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "delete-session-client",
            version: "1.0.0",
          },
        },
      }),
    });

    const sessionId = initializeResponse.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const deleteResponse = await fetch(httpServer.url, {
      method: "DELETE",
      headers: {
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
    });

    expect(deleteResponse.status).toBe(200);

    const followUpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(followUpResponse.status).toBe(404);
    await expect(followUpResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Session not found",
      },
      id: null,
    });
  });

  it("keeps authless probing and MCP transport signals consistent for remote clients", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const probeResponse = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(probeResponse.status).toBe(404);
    await expect(probeResponse.json()).resolves.toEqual({
      error: "Not found",
    });

    const getResponse = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
      },
    });

    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST, DELETE");
    await expect(getResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "remote-contract-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.headers.get("mcp-session-id")).toBeTruthy();
    expect(initializeResponse.headers.get("content-type")).toContain("application/json");
  });

  it("returns the same explicit method contract for unsupported MCP endpoint methods", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(httpServer.url, {
      method: "PUT",
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, DELETE");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "method-not-allowed" &&
      details.method === "PUT" &&
      details.path === "/mcp"
    ))).toBeTruthy();
  });

  it("accepts sessionless POST requests after initialization", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "missing-session-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);

    const response = await fetch(httpServer.url, {
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
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("\"ynab_get_mcp_version\"");
  });

  it("returns 405 for GET requests after initialization", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "missing-get-session-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);

    const response = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  it("issues a fresh session on initialize even when stale session headers are supplied", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(() => httpServer.close());

    const initializeResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": "stale-session-id",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "stale-session-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    const issuedSessionId = initializeResponse.headers.get("mcp-session-id");
    expect(issuedSessionId).toBeTruthy();
    expect(issuedSessionId).not.toBe("stale-session-id");

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": "stale-session-id",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Session not found",
      },
      id: null,
    });
  });

  it("returns 404 for non-MCP paths", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(new URL("/health", httpServer.url));

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "path-not-found" &&
      details.path === "/health"
    ))).toBeTruthy();
  });

  it("lets clients reconnect cleanly without session teardown", async () => {
    const httpServer = await startHttpServer({
      ynab,
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
    expect(firstTransport.sessionId).toBeTruthy();

    const secondClient = new Client({
      name: "ynab-mcp-bridge-test-2",
      version: "1.0.0",
    });
    const secondTransport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await secondClient.connect(secondTransport);

    expect(secondTransport.sessionId).toBeTruthy();
    expect(secondTransport.sessionId).not.toBe(firstTransport.sessionId);

    await firstClient.close();
    await secondClient.close();
  });

  it("reuses one issued session across repeated ChatGPT-style tool calls", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const initializeResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "User-Agent": "openai-mcp/1.0.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "chatgpt-reuse-client",
            version: "1.0.0",
          },
        },
      }),
    });

    const sessionId = initializeResponse.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const listResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": sessionId!,
        "User-Agent": "openai-mcp/1.0.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    expect(listResponse.status).toBe(200);

    const callResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": sessionId!,
        "User-Agent": "openai-mcp/1.0.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(callResponse.status).toBe(200);

    const chatgptSessionHandshakes = consoleErrorSpy.mock.calls.filter((call) => {
      const structuredEntry = getStructuredLogEntry(call);

      if (!structuredEntry) {
        return false;
      }

      return structuredEntry.scope === "http" &&
        structuredEntry.event === "transport.handoff" &&
        structuredEntry.userAgent === "chatgpt" &&
        structuredEntry.sessionId === sessionId &&
        structuredEntry.cleanup === false &&
        (structuredEntry.jsonRpcMethod === "tools/list" || structuredEntry.jsonRpcMethod === "tools/call");
    });

    expect(chatgptSessionHandshakes).toHaveLength(2);
  });

  it("logs the JSON-RPC method for a sessionless tools/call request", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const followUpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "User-Agent": "openai-mcp/1.0.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(followUpResponse.status).toBe(200);
    expect(findLogCall(consoleErrorSpy, "request.received", (details) => (
      details.method === "POST" &&
      details.path === "/mcp" &&
      details.userAgent === "chatgpt"
    ))).toBeTruthy();
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.method === "POST" &&
      details.path === "/mcp" &&
      details.cleanup === true &&
      details.jsonRpcMethod === "tools/call" &&
      details.userAgent === "chatgpt" &&
      details.sessionId === undefined
    ))).toBeTruthy();
  });

  it("rejects repeated MCP session headers using the SDK transport contract", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const headers = new Headers({
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    });
    headers.append("Mcp-Session-Id", "session-one");
    headers.append("Mcp-Session-Id", "session-two");

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Mcp-Session-Id header must be a single value",
      },
      id: null,
    });
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "invalid-session-header" &&
      details.path === "/mcp"
    ))).toBeTruthy();
  });

  it("returns a client error for malformed JSON without breaking later requests", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

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
    expect(invalidResponse.headers.get("access-control-allow-origin")).toBeNull();
    expect(findLogCall(consoleErrorSpy, "request.parse_error", (details) => (
      details.method === "POST" &&
      details.path === "/mcp"
    ))).toBeTruthy();

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

  it("returns 413 for oversized JSON requests instead of an internal server error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await sendRawHttpRequest(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {
            payload: "x".repeat(120_000),
          },
        },
      }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(response.body)).toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Payload too large",
      },
      id: null,
    });
    expect(findLogCall(consoleErrorSpy, "request.error")).toBeUndefined();
  });

  it("allows the started HTTP server to be closed more than once", async () => {
    const httpServer = await startHttpServer({
      ynab,
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    await expect(httpServer.close()).resolves.toBeUndefined();
    await expect(httpServer.close()).resolves.toBeUndefined();
  });

  it("exposes OAuth protected resource metadata using the configured public URL", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: ["https://mcp.example.com/"],
      resource: "https://mcp.example.com/mcp",
      scopes_supported: ["openid", "profile", "offline_access"],
    });
  });

  it("allows the bridge public origin on OAuth metadata routes and reflects it in CORS headers", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-authorization-server", httpServer.url), {
      headers: {
        Origin: "https://mcp.example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://mcp.example.com");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("allows null-origin consent submissions without relaxing other OAuth routes", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    const metadataResponse = await fetch(new URL("/.well-known/oauth-authorization-server", httpServer.url), {
      headers: {
        Origin: "null",
      },
    });

    expect(consentResponse.status).toBe(302);
    expect(consentResponse.headers.get("location")).toBeTruthy();
    expect(metadataResponse.status).toBe(403);
    await expect(metadataResponse.json()).resolves.toEqual({
      error: "Forbidden origin",
    });
  });

  it("rejects legacy Cloudflare Access oauth2 endpoints passed directly to the HTTP server", async () => {
    await expect(startHttpServer({
      ynab,
      auth: {
        audience: "https://mcp.example.com/mcp",
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/auth",
        callbackPath: "/oauth/callback",
        clientId: "cloudflare-client-id",
        clientSecret: "cloudflare-client-secret",
        deployment: "oauth-single-tenant",
        issuer: "https://example.cloudflareaccess.com",
        jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/certs",
        mode: "oauth",
        publicUrl: "https://mcp.example.com/mcp",
        scopes: ["openid", "profile"],
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/token",
      },
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    })).rejects.toThrow(
      "Cloudflare Access OAuth settings must use the per-application OIDC SaaS endpoints under /cdn-cgi/access/sso/oidc/<client-id> for issuer, authorization, token, and jwks URLs.",
    );
  });

  it("returns a bearer challenge with resource metadata when oauth mode is enabled", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        jwksUrl,
        scopes: ["openid"],
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
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
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource/mcp\"");
  });

  it("exposes OAuth authorization server metadata when oauth mode is enabled", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-authorization-server", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      scopes_supported: expect.arrayContaining(["openid", "profile", "offline_access"]),
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: expect.arrayContaining(["client_secret_post", "none"]),
    });
  });

  it("exposes a minimal OpenID configuration document when oauth mode is enabled", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/openid-configuration", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      scopes_supported: expect.arrayContaining(["openid", "profile", "offline_access"]),
      subject_types_supported: ["public"],
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: expect.arrayContaining(["client_secret_post", "none"]),
    });
  });

  it("serves OAuth authorization server metadata on Codex-style discovery probe paths", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const firstResponse = await fetch(new URL("/.well-known/oauth-authorization-server/sse", httpServer.url));
    const secondResponse = await fetch(new URL("/sse/.well-known/oauth-authorization-server", httpServer.url));

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });
  });

  it("registers OAuth clients with the requested public metadata", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);

    expect(registration.client_id).toEqual(expect.any(String));
    expect(registration.client_id_issued_at).toEqual(expect.any(Number));
    expect(registration.client_name).toBe("Claude Web");
    expect(registration.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(registration.redirect_uris).toEqual(["https://claude.ai/oauth/callback"]);
    expect(registration.response_types).toEqual(["code"]);
    expect(registration.token_endpoint_auth_method).toBe("none");
  });

  it("rejects client registrations with insecure redirect URIs", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "Insecure Client",
        grant_types: ["authorization_code"],
        redirect_uris: ["http://claude.ai/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("rejects overbroad client registration metadata", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "Overbroad Client",
        contacts: ["owner@example.com"],
        grant_types: ["authorization_code", "client_credentials"],
        jwks_uri: "https://client.example.com/jwks.json",
        redirect_uris: ["https://claude.ai/oauth/callback"],
        response_types: ["code", "token"],
        token_endpoint_auth_method: "private_key_jwt",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("rejects authorization requests whose redirect URI is not registered exactly", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);

    const response = await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/other-callback")}&response_type=code&code_challenge=test-challenge&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123&resource=${encodeURIComponent("https://mcp.example.com/mcp")}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
  });

  it("requires local client consent before redirecting authorization requests through the upstream provider", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);

    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(authorizeResponse.status).toBe(200);
    const consentBody = await authorizeResponse.text();
    expect(consentBody).toContain("Approve MCP client access");
    expect(upstream.getLastTokenRequest()).toBeUndefined();

    const consentResponse = await approveAuthorizationConsent(httpServer.url, consentBody);

    expect(consentResponse.status).toBe(302);
    const location = consentResponse.headers.get("location");

    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.origin).toBe(new URL(upstream.authorizationUrl).origin);
    expect(redirectUrl.pathname).toBe("/authorize");
    expect(redirectUrl.searchParams.get("client_id")).toBe("cloudflare-client-id");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("scope")).toBe("offline_access openid profile");
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
  });

  it("escapes client metadata and sends hardened headers on the consent page", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registrationResponse = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "<img src=x onerror=alert('boom')>",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const registration = await registrationResponse.json() as { client_id: string };

    expect(registrationResponse.status).toBe(201);

    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const consentBody = await authorizeResponse.text();

    expect(authorizeResponse.status).toBe(200);
    expect(consentBody).toContain("&lt;img src=x onerror=alert(&#39;boom&#39;)&gt;");
    expect(consentBody).not.toContain("<img src=x onerror=alert('boom')>");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain(`form-action 'self' ${new URL(upstream.authorizationUrl).origin}`);
    expect(authorizeResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(authorizeResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect(authorizeResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("exchanges upstream callback codes and redirects back to the registered client", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });

    const upstreamState = new URL(consentResponse.headers.get("location")!, httpServer.url).searchParams.get("state");
    expect(upstreamState).toBeTruthy();

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(callbackResponse.status).toBe(302);
    const location = callbackResponse.headers.get("location");
    expect(location).toBeTruthy();

    const clientRedirectUrl = new URL(location!);
    expect(clientRedirectUrl.origin).toBe("https://claude.ai");
    expect(clientRedirectUrl.pathname).toBe("/oauth/callback");
    expect(clientRedirectUrl.searchParams.get("code")).toBeTruthy();
    expect(clientRedirectUrl.searchParams.get("state")).toBe("client-state-123");

    expect(upstream.getLastTokenRequest()).toMatchObject({
      body: expect.any(URLSearchParams),
    });
    expect(upstream.getLastTokenRequest()?.body.get("grant_type")).toBe("authorization_code");
    expect(upstream.getLastTokenRequest()?.body.get("code")).toBe("upstream-code-123");
    expect(upstream.getLastTokenRequest()?.body.get("client_id")).toBe("cloudflare-client-id");
    expect(upstream.getLastTokenRequest()?.body.get("client_secret")).toBe("cloudflare-client-secret");
    expect(upstream.getLastTokenRequest()?.body.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");
  });

  it("returns a useful OAuth error response when the upstream callback omits state", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });

    expect(consentResponse.status).toBe(302);
    expect(new URL(consentResponse.headers.get("location")!).searchParams.get("state")).toBeTruthy();

    const callbackResponse = await fetch(new URL(
      "/oauth/callback?error=access_denied&error_description=User%20cancelled%20access",
      httpServer.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(callbackResponse.status).toBe(400);
    await expect(callbackResponse.json()).resolves.toEqual({
      error: "invalid_request",
      error_description: "Upstream OAuth callback returned error \"access_denied\" without state. User cancelled access",
    });
    expect(upstream.getLastTokenRequest()).toBeUndefined();
    expect(findOAuthLogCall(consoleErrorSpy, "callback.failed", (details) => (
      details.errorMessage === "Upstream OAuth callback returned error \"access_denied\" without state. User cancelled access" &&
      details.errorName === "InvalidRequestError" &&
      details.upstreamError === "access_denied" &&
      details.upstreamErrorDescription === "User cancelled access"
    ))).toBeTruthy();
  });

  it("exchanges a local authorization code for a bearer token and accepts it on MCP requests", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tokenUserAgent = "chatgpt-token-client/1.0";
    const mcpUserAgent = "chatgpt-mcp-client/1.0";
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());
    const upstreamState = new URL(consentResponse.headers.get("location")!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const tokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
        "User-Agent": tokenUserAgent,
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json();
    expect(tokens.access_token).toEqual(expect.any(String));
    expect(tokens.refresh_token).toEqual(expect.any(String));
    expect(tokens.token_type).toBe("Bearer");

    const mcpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "User-Agent": mcpUserAgent,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(mcpResponse.status).toBe(200);
    expect(findLogCall(consoleErrorSpy, "request.received", (details) => (
      details.path === "/token" &&
      details.method === "POST" &&
      details.userAgent === tokenUserAgent &&
      !("authorization" in details)
    ))).toBeTruthy();
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.jsonRpcMethod === "tools/list" &&
      details.userAgent === mcpUserAgent &&
      !("authorization" in details)
    ))).toBeTruthy();
    expect(findOAuthLogCall(consoleErrorSpy, "token.exchange.succeeded", (details) => (
      details.clientId === registration.client_id &&
      details.grantType === "authorization_code" &&
      details.hasAccessToken === true &&
      details.hasExpiresIn === true &&
      details.hasRefreshToken === true &&
      details.hasScope === true &&
      details.hasTokenType === true &&
      Array.isArray(details.tokenResponseFields) &&
      details.tokenResponseFields.includes("access_token") &&
      details.tokenResponseFields.includes("expires_in") &&
      details.tokenResponseFields.includes("refresh_token") &&
      details.tokenResponseFields.includes("scope") &&
      details.tokenResponseFields.includes("token_type") &&
      !("accessToken" in details) &&
      !("refreshToken" in details)
    ))).toBeTruthy();
    expect(findOAuthLogCall(consoleErrorSpy, "callback.completed", (details) => (
      details.hasCode === true &&
      details.hasError === false &&
      details.hasState === true &&
      details.issuedAuthorizationCode === true
    ))).toBeTruthy();
    expect(findOAuthLogCall(consoleErrorSpy, "token.exchange.succeeded", (details) => (
      details.grantType === "authorization_code" &&
      details.clientId === registration.client_id &&
      details.hasRedirectUri === true &&
      details.hasResource === true &&
      details.issuedAccessToken === true &&
      details.issuedRefreshToken === true &&
      details.scopeCount === 3 &&
      details.hasAccessToken === true &&
      details.hasExpiresIn === true &&
      details.hasRefreshToken === true &&
      details.hasScope === true &&
      details.hasTokenType === true &&
      Array.isArray(details.tokenResponseFields) &&
      details.tokenResponseFields.includes("access_token") &&
      details.tokenResponseFields.includes("expires_in") &&
      details.tokenResponseFields.includes("refresh_token") &&
      details.tokenResponseFields.includes("scope") &&
      details.tokenResponseFields.includes("token_type") &&
      !("accessToken" in details) &&
      !("refreshToken" in details)
    ))).toBeTruthy();
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.jsonRpcMethod === "tools/list" &&
      details.userAgent === mcpUserAgent &&
      details.authMode === "oauth" &&
      details.authRequired === true &&
      details.authClientId === registration.client_id &&
      details.hasAuthorizationHeader === true
    ))).toBeTruthy();
  });

  it("accepts token exchanges forwarded through a trusted proxy header", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    const upstreamState = new URL(consentResponse.headers.get("location")!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const tokenResponse = await sendRawHttpRequest(httpServer.url, {
      method: "POST",
      path: "/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
        "X-Forwarded-For": "203.0.113.10",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }).toString(),
    });

    expect(tokenResponse.statusCode).toBe(200);
    expect(JSON.parse(tokenResponse.body)).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: "Bearer",
    });
    expect(consoleErrorSpy.mock.calls.some(([firstArg]) => String(firstArg).includes("ValidationError"))).toBe(false);
  });

  it("brokers refresh-token exchanges through the upstream provider before issuing a fresh local token", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    const upstreamState = new URL(consentResponse.headers.get("location")!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const initialTokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });
    const initialTokens = await initialTokenResponse.json() as {
      refresh_token: string;
    };

    expect(initialTokenResponse.status).toBe(200);

    const refreshResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        grant_type: "refresh_token",
        refresh_token: initialTokens.refresh_token,
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(refreshResponse.status).toBe(200);
    const refreshedTokens = await refreshResponse.json() as {
      refresh_token: string;
    };
    expect(refreshedTokens.refresh_token).toEqual(expect.any(String));
    expect(refreshedTokens.refresh_token).not.toBe(initialTokens.refresh_token);
    expect(upstream.getLastTokenRequest()?.body.get("grant_type")).toBe("refresh_token");
    expect(upstream.getLastTokenRequest()?.body.get("refresh_token")).toBe("upstream-refresh-token");
    expect(upstream.getLastTokenRequest()?.body.get("client_id")).toBe("cloudflare-client-id");
    expect(upstream.getLastTokenRequest()?.body.get("client_secret")).toBe("cloudflare-client-secret");
    expect(findOAuthLogCall(consoleErrorSpy, "token.refresh.succeeded", (details) => (
      details.clientId === registration.client_id &&
      details.grantType === "refresh_token" &&
      details.hasAccessToken === true &&
      details.hasExpiresIn === true &&
      details.hasRefreshToken === true &&
      details.hasScope === true &&
      details.hasTokenType === true &&
      Array.isArray(details.tokenResponseFields) &&
      details.tokenResponseFields.includes("access_token") &&
      details.tokenResponseFields.includes("expires_in") &&
      details.tokenResponseFields.includes("refresh_token") &&
      details.tokenResponseFields.includes("scope") &&
      details.tokenResponseFields.includes("token_type") &&
      !("accessToken" in details) &&
      !("refreshToken" in details)
    ))).toBeTruthy();

    const replayResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        grant_type: "refresh_token",
        refresh_token: initialTokens.refresh_token,
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.json()).resolves.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("logs redacted refresh failures when the upstream provider rejects a refresh exchange", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshUserAgent = "chatgpt-refresh-client/1.0";
    let lastTokenRequestBody: URLSearchParams | undefined;
    const upstreamServer = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/authorize") {
        res.statusCode = 200;
        res.end("ok");
        return;
      }

      if (requestUrl.pathname === "/jwks") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [] }));
        return;
      }

      if (requestUrl.pathname !== "/token" || req.method !== "POST") {
        res.statusCode = 404;
        res.end();
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on("end", () => {
        lastTokenRequestBody = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        res.setHeader("content-type", "application/json");

        if (lastTokenRequestBody.get("grant_type") === "refresh_token") {
          res.statusCode = 400;
          res.end(JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token is invalid.",
          }));
          return;
        }

        res.end(JSON.stringify({
          access_token: "upstream-access-token",
          expires_in: 3600,
          refresh_token: "upstream-refresh-token",
          scope: "openid profile",
          token_type: "Bearer",
        }));
      });
    });

    await new Promise<void>((resolve, reject) => {
      upstreamServer.once("error", reject);
      upstreamServer.listen(0, "127.0.0.1", () => {
        upstreamServer.off("error", reject);
        resolve();
      });
    });

    const address = upstreamServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Upstream refresh failure test server did not expose a TCP address");
    }

    const upstreamOrigin = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        upstreamServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: `${upstreamOrigin}/authorize`,
        issuer: upstreamOrigin,
        jwksUrl: `${upstreamOrigin}/jwks`,
        tokenUrl: `${upstreamOrigin}/token`,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    expect(consentResponse.status).toBe(302);
    const consentLocation = consentResponse.headers.get("location");
    expect(consentLocation).toBeTruthy();
    const upstreamState = new URL(consentLocation!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const initialTokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });
    const initialTokens = await initialTokenResponse.json() as {
      refresh_token: string;
    };

    expect(initialTokenResponse.status).toBe(200);

    const refreshResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
        "User-Agent": refreshUserAgent,
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        grant_type: "refresh_token",
        refresh_token: initialTokens.refresh_token,
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(refreshResponse.ok).toBe(false);
    expect(lastTokenRequestBody?.get("grant_type")).toBe("refresh_token");
    expect(findLogCall(consoleErrorSpy, "request.received", (details) => (
      details.path === "/token" &&
      details.method === "POST" &&
      details.userAgent === refreshUserAgent
    ))).toBeTruthy();
    expect(findOAuthLogCall(consoleErrorSpy, "token.refresh.failed", (details) => (
      details.clientId === registration.client_id &&
      details.grantType === "refresh_token" &&
      details.hasRefreshToken === true &&
      details.hasResource === true &&
      details.scopeCount === 0 &&
      details.errorName === "ServerError" &&
      details.errorMessage === "Upstream refresh exchange failed with status 400." &&
      details.upstreamError === "invalid_grant" &&
      details.upstreamErrorDescription === "Refresh token is invalid." &&
      Array.isArray(details.upstreamErrorFields) &&
      details.upstreamErrorFields.includes("error") &&
      details.upstreamErrorFields.includes("error_description") &&
      !("refreshToken" in details)
    ))).toBeTruthy();
  });

  it("logs ChatGPT for OpenAI-style OAuth discovery and broker routes when chatgpt user agents drive the flow", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const metadataUserAgent = "chatgpt-web/1.0";
    const authorizeUserAgent = "chatgpt-browser/1.0";
    const callbackUserAgent = "chatgpt-callback/1.0";
    const tokenUserAgent = "chatgpt-token-client/1.0";
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const metadataResponse = await fetch(new URL("/.well-known/openid-configuration", httpServer.url), {
      headers: {
        "User-Agent": metadataUserAgent,
      },
    });

    expect(metadataResponse.status).toBe(200);

    const registrationResponse = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_name: "ChatGPT Web",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://chatgpt.com/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    expect(registrationResponse.status).toBe(201);
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const codeVerifier = "chatgpt-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);

    const authorizeResponse = await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://chatgpt.com/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123&resource=${encodeURIComponent("https://mcp.example.com/mcp")}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        "User-Agent": authorizeUserAgent,
      },
    });

    expect(authorizeResponse.status).toBe(200);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    expect(consentResponse.status).toBe(302);
    const consentLocation = consentResponse.headers.get("location");
    expect(consentLocation).toBeTruthy();
    const upstreamState = new URL(consentLocation!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        "User-Agent": callbackUserAgent,
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const tokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": tokenUserAgent,
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://chatgpt.com/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(tokenResponse.status).toBe(200);
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/.well-known/openid-configuration" &&
      details.profileId === "chatgpt" &&
      details.reason === "user-agent:chatgpt"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/authorize" &&
      details.profileId === "chatgpt" &&
      details.reason === "user-agent:chatgpt"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/oauth/callback" &&
      details.profileId === "chatgpt" &&
      details.reason === "user-agent:chatgpt"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/token" &&
      details.method === "POST" &&
      details.profileId === "chatgpt" &&
      details.reason === "user-agent:chatgpt"
    ))).toBeTruthy();
  });

  it("logs Codex for OAuth discovery aliases and broker routes when codex user agents drive the flow", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const discoveryUserAgent = "OpenAI Codex/0.1.0";
    const authorizeUserAgent = "OpenAI Codex Browser/0.1.0";
    const callbackUserAgent = "OpenAI Codex Callback/0.1.0";
    const tokenUserAgent = "OpenAI Codex Token/0.1.0";
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const discoveryResponse = await fetch(new URL("/.well-known/oauth-authorization-server/sse", httpServer.url), {
      headers: {
        "User-Agent": discoveryUserAgent,
      },
    });

    expect(discoveryResponse.status).toBe(200);

    const registrationResponse = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_name: "OpenAI Codex",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://codex.openai.com/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    expect(registrationResponse.status).toBe(201);
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const codeVerifier = "codex-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);

    const authorizeResponse = await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://codex.openai.com/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123&resource=${encodeURIComponent("https://mcp.example.com/mcp")}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        "User-Agent": authorizeUserAgent,
      },
    });

    expect(authorizeResponse.status).toBe(200);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });
    expect(consentResponse.status).toBe(302);
    const consentLocation = consentResponse.headers.get("location");
    expect(consentLocation).toBeTruthy();
    const upstreamState = new URL(consentLocation!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        "User-Agent": callbackUserAgent,
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    const tokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": tokenUserAgent,
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://codex.openai.com/oauth/callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(tokenResponse.status).toBe(200);
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/.well-known/oauth-authorization-server/sse" &&
      details.profileId === "codex"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/authorize" &&
      details.profileId === "codex" &&
      details.reason === "user-agent:codex"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/oauth/callback" &&
      details.profileId === "codex" &&
      details.reason === "user-agent:codex"
    ))).toBeTruthy();
    expect(findProfileLogCall(consoleErrorSpy, "profile.detected", (details) => (
      details.path === "/token" &&
      details.method === "POST" &&
      details.profileId === "codex" &&
      details.reason === "user-agent:codex"
    ))).toBeTruthy();
  });

  it("rejects upstream OAuth bearer tokens passed directly in the authorization header", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createOAuthTestToken(privateKey);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        jwksUrl,
        scopes: ["openid"],
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("accepts Cloudflare Access JWT assertion headers when authorization is absent", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createOAuthTestToken(privateKey);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        jwksUrl,
        scopes: ["openid"],
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Cf-Access-Jwt-Assertion": token,
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "ynab_list_plans",
          }),
        ]),
      },
    });
  });

  it("logs oauth auth failures without leaking token material", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        jwksUrl,
        scopes: ["openid"],
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(httpServer.url, {
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
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "unauthorized" &&
      details.path === "/mcp" &&
      details.authMode === "oauth" &&
      details.authRequired === true &&
      details.hasAuthorizationHeader === false &&
      details.hasCfAccessJwtAssertion === false &&
      !("authorization" in details)
    ))).toBeTruthy();
  });
});
