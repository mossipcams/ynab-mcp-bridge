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
  createGenericOAuthAuth,
  createCodeChallenge,
  registerOAuthClient,
  startAuthorization,
  startUpstreamOAuthServer,
} from "./__test__/oauthTestHelpers.js";
import { getPackageInfo } from "./packageInfo.js";

describe("startHttpServer", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const originalEnv = process.env;
  const packageInfo = getPackageInfo();
  const ynab = {
    apiToken: "test-token",
  } as const;

  function findLogCall(
    spy: ReturnType<typeof vi.spyOn>,
    event: string,
    matcher: (details: Record<string, unknown>) => boolean = () => true,
  ) {
    return spy.mock.calls.find(([scope, loggedEvent, details]) => (
      scope === "[http]" &&
      loggedEvent === event &&
      typeof details === "object" &&
      details !== null &&
      matcher(details as Record<string, unknown>)
    ));
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
      scope: overrides.scope ?? "openid profile",
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
      details.method === "POST" &&
      details.path === "/mcp" &&
      details.origin === "https://claude.ai"
    ))).toBeTruthy();
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.path === "/mcp" &&
      details.method === "POST" &&
      details.jsonRpcMethod === "initialize" &&
      details.sessionId === undefined &&
      details.cleanup === true
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

  it("advertises DELETE support on oauth MCP preflight requests", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "DELETE",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
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
    expect(initializeResponse.headers.get("mcp-session-id")).toBeNull();

    const streamResponse = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
    });

    expect(streamResponse.status).toBe(405);
    expect(streamResponse.headers.get("allow")).toBe("POST");
  });

  it("returns a JSON initialize response without creating an MCP session", async () => {
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
    expect(response.headers.get("mcp-session-id")).toBeNull();
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
    expect(getResponse.headers.get("allow")).toBe("POST");
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
    expect(initializeResponse.headers.get("mcp-session-id")).toBeNull();
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
    expect(response.headers.get("allow")).toBe("POST");
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

  it("ignores stale session headers on initialize and later requests", async () => {
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
    expect(initializeResponse.headers.get("mcp-session-id")).toBeNull();

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

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    await expect(response.text()).resolves.toContain("\"name\":\"ynab_get_mcp_version\"");
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
    expect(firstTransport.sessionId).toBeUndefined();

    const secondClient = new Client({
      name: "ynab-mcp-bridge-test-2",
      version: "1.0.0",
    });
    const secondTransport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    await secondClient.connect(secondTransport);

    expect(secondTransport.sessionId).toBeUndefined();

    await firstClient.close();
    await secondClient.close();
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
    expect(findLogCall(consoleErrorSpy, "transport.handoff", (details) => (
      details.method === "POST" &&
      details.path === "/mcp" &&
      details.cleanup === true &&
      details.jsonRpcMethod === "tools/call" &&
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
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Error handling MCP request:",
      expect.anything(),
    );
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
      auth: createGenericOAuthAuth({ jwksUrl }),
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
      scopes_supported: ["openid", "profile"],
    });
  });

  it("allows the bridge public origin on OAuth metadata routes and reflects it in CORS headers", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
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

  it("rejects legacy Cloudflare Access oauth2 endpoints passed directly to the HTTP server", async () => {
    await expect(startHttpServer({
      ynab,
      auth: {
        audience: "https://mcp.example.com/mcp",
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/auth",
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

  it("returns a bearer challenge with resource metadata for protected MCP tool calls in oauth mode", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
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
        method: "tools/call",
        params: {
          name: "ynab_get_user",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource/mcp\"");
  });

  it("allows unauthenticated tools/list in oauth mode and exposes per-tool security metadata", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
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

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      result: {
        tools: Array<{
          _meta?: {
            securitySchemes?: Array<{ scopes?: string[]; type: string }>;
          };
          name: string;
        }>;
      };
    };
    const versionTool = payload.result.tools.find((tool) => tool.name === "ynab_get_mcp_version");
    const userTool = payload.result.tools.find((tool) => tool.name === "ynab_get_user");

    expect(versionTool?._meta?.securitySchemes).toEqual([
      {
        type: "noauth",
      },
    ]);
    expect(userTool?._meta?.securitySchemes).toEqual([
      {
        scopes: ["openid", "profile"],
        type: "oauth2",
      },
    ]);
  });

  it("allows unauthenticated public tool calls in oauth mode while still challenging protected tools", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const publicResponse = await fetch(httpServer.url, {
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

    expect(publicResponse.status).toBe(200);
    await expect(publicResponse.text()).resolves.toContain(packageInfo.version);

    const protectedResponse = await fetch(httpServer.url, {
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
        method: "tools/call",
        params: {
          name: "ynab_get_user",
          arguments: {},
        },
      }),
    });

    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("exposes OAuth authorization server metadata when oauth mode is enabled", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
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
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: expect.arrayContaining(["client_secret_post", "none"]),
    });
  });

  it("aliases OpenID discovery to the OAuth authorization server metadata endpoint", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
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
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: expect.arrayContaining(["client_secret_post", "none"]),
    });
  });

  it("exposes path-based OAuth and OpenID discovery aliases for MCP hosts that start from /mcp", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const metadataPaths = [
      "/.well-known/oauth-authorization-server/mcp",
      "/.well-known/openid-configuration/mcp",
      "/mcp/.well-known/openid-configuration",
    ];

    for (const metadataPath of metadataPaths) {
      const response = await fetch(new URL(metadataPath, httpServer.url), {
        headers: {
          Origin: "https://claude.ai",
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        authorization_endpoint: "https://mcp.example.com/authorize",
        issuer: "https://mcp.example.com/",
        registration_endpoint: "https://mcp.example.com/register",
        token_endpoint: "https://mcp.example.com/token",
        token_endpoint_auth_methods_supported: expect.arrayContaining(["client_secret_post", "none"]),
      });
    }
  });

  it("registers OAuth clients with the requested public metadata", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({ jwksUrl }),
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
      auth: createGenericOAuthAuth({ jwksUrl }),
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
      auth: createGenericOAuthAuth({ jwksUrl }),
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
    expect(redirectUrl.searchParams.get("scope")).toBe("openid profile");
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
  });

  it("accepts oauth consent posts from null origins used by popup auth flows", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai", "https://chatgpt.com"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(authorizeResponse.status).toBe(200);

    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });

    expect(consentResponse.status).toBe(302);
    expect(consentResponse.headers.get("location")).toContain("/authorize");
  });

  it("treats consent submits without a button action as approval", async () => {
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
    const consentBody = await authorizeResponse.text();
    const challengeMatch = consentBody.match(/name="consent_challenge" value="([^"]+)"/);

    expect(authorizeResponse.status).toBe(200);
    expect(challengeMatch?.[1]).toBeTruthy();

    const consentResponse = await fetch(new URL("/authorize/consent", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        consent_challenge: challengeMatch![1],
      }),
      redirect: "manual",
    });

    expect(consentResponse.status).toBe(302);
    expect(consentResponse.headers.get("location")).toContain("/authorize");
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
    expect(consentBody).toContain("After you approve, this window may take a moment to continue.");
    expect(consentBody).toContain("Continuing...");
    expect(consentBody).toContain("approveButton.disabled = true");
    expect(consentBody).toContain("denyButton.disabled = true");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(authorizeResponse.headers.get("content-security-policy")).toContain(
      `form-action 'self' https://claude.ai ${new URL(upstream.authorizationUrl).origin}`,
    );
    expect(authorizeResponse.headers.get("content-security-policy")).toContain("script-src 'nonce-");
    expect(authorizeResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(authorizeResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect(authorizeResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("accepts oauth consent posts from null origins used by popup auth flows", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      allowedOrigins: ["https://claude.ai", "https://chatgpt.com"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(authorizeResponse.status).toBe(200);

    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text(), {
      origin: "null",
    });

    expect(consentResponse.status).toBe(302);
    expect(consentResponse.headers.get("location")).toContain("/authorize");
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
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());

    const upstreamState = new URL(consentResponse.headers.get("location")!).searchParams.get("state");
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

  it("exchanges a local authorization code for a bearer token and accepts it on MCP requests", async () => {
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

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());
    const upstreamState = new URL(consentResponse.headers.get("location")!).searchParams.get("state");

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
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(mcpResponse.status).toBe(200);
  });

  it("creates an authenticated MCP session that can open a GET SSE stream after oauth authorization", async () => {
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

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());
    const upstreamState = new URL(consentResponse.headers.get("location")!).searchParams.get("state");

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
    const tokens = await tokenResponse.json() as {
      access_token: string;
    };

    const initializeResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tokens.access_token}`,
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
            name: "oauth-sse-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initializeResponse.status).toBe(200);
    const sessionId = initializeResponse.headers.get("mcp-session-id");
    expect(sessionId).toEqual(expect.any(String));

    const streamResponse = await fetch(httpServer.url, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${tokens.access_token}`,
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": sessionId!,
      },
    });

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
    expect(streamResponse.headers.get("mcp-session-id")).toBe(sessionId);
    await streamResponse.body?.cancel();
  });

  it("brokers refresh-token exchanges through the upstream provider before issuing a fresh local token", async () => {
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

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());
    const upstreamState = new URL(consentResponse.headers.get("location")!).searchParams.get("state");

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

  it("rejects upstream OAuth bearer tokens passed directly on protected MCP tool calls", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createOAuthTestToken(privateKey, {
      iss: "https://id.example.com",
    });
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
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
        method: "tools/call",
        params: {
          name: "ynab_get_user",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("still rejects null origins on non-oauth MCP requests", async () => {
    const httpServer = await startHttpServer({
      ynab,
      allowedOrigins: ["https://claude.ai", "https://chatgpt.com"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "null",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden origin",
    });
  });

  it("trusts proxy forwarding on oauth routes so forwarded headers do not trigger rate-limit validation errors", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
        jwksUrl,
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      port: 0,
    });
    cleanups.push(async () => {
      consoleErrorSpy.mockRestore();
      await httpServer.close();
    });

    const response = await fetch(new URL("/register", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "X-Forwarded-For": "203.0.113.10",
      },
      body: JSON.stringify({
        client_name: "Claude Web",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    expect(response.status).toBe(201);
    expect(consoleErrorSpy.mock.calls.some(([message]) => (
      typeof message === "string" &&
      message.includes("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR")
    ))).toBe(false);
  });

  it("rejects Cloudflare Access JWT assertion headers on protected MCP tool calls", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createOAuthTestToken(privateKey, {
      iss: "https://id.example.com",
    });
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
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
        method: "tools/call",
        params: {
          arguments: {},
          name: "ynab_get_user",
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects Cloudflare Access JWT assertion headers on protected MCP tool calls", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createOAuthTestToken(privateKey, {
      iss: "https://id.example.com",
    });
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
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
        method: "tools/call",
        params: {
          name: "ynab_get_user",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("logs oauth auth failures for protected tool calls without leaking token material", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createGenericOAuthAuth({
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
        method: "tools/call",
        params: {
          name: "ynab_get_user",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(findLogCall(consoleErrorSpy, "request.rejected", (details) => (
      details.reason === "unauthorized" &&
      details.path === "/mcp" &&
      !("authorization" in details)
    ))).toBeTruthy();
  });
});
