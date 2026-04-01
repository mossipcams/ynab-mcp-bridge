import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { parseAuthConfig } from "./auth2/config/schema.js";
import { startHttpServer } from "./httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "./oauthTestHelpers.js";

describe("http transport direct authenticated tool dispatch", () => {
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

  async function startOAuthServer(onManagedRequestCreated?: () => void) {
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
    }, {
      ...(onManagedRequestCreated ? { onManagedRequestCreated } : {}),
    });
    cleanups.push(() => server.close());
    return server;
  }

  it("bypasses managed request creation for authenticated sessionless tool calls", async () => {
    let managedRequestCount = 0;
    const server = await startOAuthServer(() => {
      managedRequestCount += 1;
    });
    const tokens = await issueAccessToken(server.url);

    const response = await fetch(server.url, {
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
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(managedRequestCount).toBe(0);
  });

  it("keeps session-bound tool calls on the managed transport path", async () => {
    let managedRequestCount = 0;
    const server = await startOAuthServer(() => {
      managedRequestCount += 1;
    });
    const tokens = await issueAccessToken(server.url);

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Session-Id": "stale-session-id",
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
    expect(managedRequestCount).toBe(1);
  });

  it("still rejects invalid bearer tokens before any direct dispatch", async () => {
    let managedRequestCount = 0;
    const server = await startOAuthServer(() => {
      managedRequestCount += 1;
    });

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer invalid-token",
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

    expect(response.status).toBe(401);
    expect(managedRequestCount).toBe(0);
  });

  it("returns validation failures through the direct path without creating a managed request", async () => {
    let managedRequestCount = 0;
    const server = await startOAuthServer(() => {
      managedRequestCount += 1;
    });
    const tokens = await issueAccessToken(server.url);

    const response = await fetch(server.url, {
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
        method: "tools/call",
        params: {
          name: "ynab_get_month_category",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("Input validation error"),
          },
        ],
      },
    });
    expect(managedRequestCount).toBe(0);
  });
});
