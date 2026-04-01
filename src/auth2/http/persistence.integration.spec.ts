import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 persistence", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("persists registered clients and grant state across restarts", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-auth2-store-"));
    const storePath = path.join(tempDir, "auth2-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const upstream = await startUpstreamOAuthServer(cleanups);
    const auth = createCloudflareOAuthAuth({
      authorizationUrl: upstream.authorizationUrl,
      issuer: upstream.issuer,
      jwksUrl: upstream.jwksUrl,
      storePath,
      tokenUrl: upstream.tokenUrl,
    });
    const auth2Config = parseAuthConfig({
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
    });

    let server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth,
      auth2Config,
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const registration = await fetch(new URL("/register", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "Claude",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const registeredClient = await registration.json() as {
      client_id: string;
    };
    const verifier = "persistent-client-verifier";
    const authorize = await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(registeredClient.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge(verifier))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=persistent-client-state`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });
    const upstreamState = new URL(authorize.headers.get("location")!).searchParams.get("state");

    await server.close();
    cleanups.pop();

    server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth,
      auth2Config: parseAuthConfig({
        ...auth2Config,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const callback = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });

    expect(callback.status).toBe(302);
    const code = new URL(callback.headers.get("location")!).searchParams.get("code");

    const tokenResponse = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registeredClient.client_id,
        code: code!,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      }),
    });
    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
    };

    const persistedAfterExchange = readFileSync(storePath, "utf8");
    expect(persistedAfterExchange).not.toContain(tokens.access_token);
    expect(persistedAfterExchange).not.toContain(tokens.refresh_token);
    expect(persistedAfterExchange).not.toContain("upstream-access-token");
    expect(persistedAfterExchange).not.toContain("upstream-refresh-token");

    await server.close();
    cleanups.pop();

    server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth,
      auth2Config: parseAuthConfig({
        ...auth2Config,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

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
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "persistent-auth2-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(authorized.status).toBe(200);

    const refreshed = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registeredClient.client_id,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      }),
    });

    expect(refreshed.status).toBe(200);
  });
});
