import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 protected MCP resource", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function issueAccessToken(serverUrl: string) {
    const verifier = "client-a-verifier";
    const authorize = await fetch(new URL(
      `/authorize?client_id=client-a&redirect_uri=${encodeURIComponent("https://claude.ai/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge(verifier))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123`,
      serverUrl,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });
    const upstreamState = new URL(authorize.headers.get("location")!).searchParams.get("state");
    const callback = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      serverUrl,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });
    const code = new URL(callback.headers.get("location")!).searchParams.get("code");
    const tokenResponse = await fetch(new URL("/token", serverUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: code!,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    });

    return await tokenResponse.json() as {
      access_token: string;
    };
  }

  it("protects tool calls on /mcp with auth2-issued bearer tokens while leaving bootstrap public", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: parseAuthConfig({
        accessTokenTtlSec: 3600,
        authCodeTtlSec: 300,
        callbackPath: "/oauth/callback",
        clients: [
          {
            clientId: "client-a",
            providerId: "default",
            redirectUri: "https://claude.ai/oauth/callback",
            scopes: ["openid", "profile"],
          },
        ],
        provider: {
          authorizationEndpoint: upstream.authorizationUrl,
          clientId: "cloudflare-client-id",
          clientSecret: "cloudflare-client-secret",
          issuer: upstream.issuer,
          jwksUri: upstream.jwksUrl,
          tokenEndpoint: upstream.tokenUrl,
          usePkce: true,
        },
        publicBaseUrl: "http://127.0.0.1",
        refreshTokenTtlSec: 2_592_000,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const bootstrap = await fetch(server.url, {
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
            name: "auth2-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(bootstrap.status).toBe(200);
    await expect(bootstrap.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
      },
    });

    const unauthorized = await fetch(server.url, {
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
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(unauthorized.status).toBe(401);

    const tokens = await issueAccessToken(server.url);
    const authorized = await fetch(server.url, {
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
        id: 3,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(authorized.status).toBe(200);
  });

  it("allows unauthenticated MCP bootstrap methods while keeping tool calls protected", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: parseAuthConfig({
        accessTokenTtlSec: 3600,
        authCodeTtlSec: 300,
        callbackPath: "/oauth/callback",
        clients: [
          {
            clientId: "client-a",
            providerId: "default",
            redirectUri: "https://claude.ai/oauth/callback",
            scopes: ["openid", "profile"],
          },
        ],
        provider: {
          authorizationEndpoint: upstream.authorizationUrl,
          clientId: "cloudflare-client-id",
          clientSecret: "cloudflare-client-secret",
          issuer: upstream.issuer,
          jwksUri: upstream.jwksUrl,
          tokenEndpoint: upstream.tokenUrl,
          usePkce: true,
        },
        publicBaseUrl: "http://127.0.0.1",
        refreshTokenTtlSec: 2_592_000,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const initialize = await fetch(server.url, {
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
            name: "auth2-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initialize.status).toBe(200);
    await expect(initialize.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
      },
    });

    const listTools = await fetch(server.url, {
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

    expect(listTools.status).toBe(200);
    await expect(listTools.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "ynab_get_mcp_version",
          }),
        ]),
      },
    });

    const listResources = await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "resources/list",
        params: {},
      }),
    });

    expect(listResources.status).toBe(200);
    await expect(listResources.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        resources: expect.arrayContaining([
          expect.objectContaining({
            name: "ynab_list_accounts",
          }),
        ]),
      },
    });

    const callTool = await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(callTool.status).toBe(401);
    await expect(callTool.json()).resolves.toMatchObject({
      error: "invalid_token",
      error_description: "Missing bearer token.",
    });
  });

  it("serves canonical protected-resource metadata from auth2", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: parseAuthConfig({
        accessTokenTtlSec: 3600,
        authCodeTtlSec: 300,
        callbackPath: "/oauth/callback",
        clients: [
          {
            clientId: "client-a",
            providerId: "default",
            redirectUri: "https://claude.ai/oauth/callback",
            scopes: ["openid", "profile"],
          },
        ],
        provider: {
          authorizationEndpoint: upstream.authorizationUrl,
          clientId: "cloudflare-client-id",
          clientSecret: "cloudflare-client-secret",
          issuer: upstream.issuer,
          jwksUri: upstream.jwksUrl,
          tokenEndpoint: upstream.tokenUrl,
          usePkce: true,
        },
        publicBaseUrl: "http://127.0.0.1",
        refreshTokenTtlSec: 2_592_000,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", server.url));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: ["https://mcp.example.com/"],
      resource: "https://mcp.example.com/mcp",
      resource_name: "YNAB MCP Bridge",
    });
  });
});
