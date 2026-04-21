import { createServer as createNodeHttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 refresh route", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function startUpstreamOAuthServerWithoutRefreshToken() {
    const server = createNodeHttpServer((req, res) => {
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

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          access_token: "upstream-access-token",
          expires_in: 1800,
          scope: "openid profile",
          token_type: "Bearer",
        }));
        return;
      }

      res.statusCode = 404;
      res.end();
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
      throw new Error("Upstream OAuth test server did not expose a TCP address");
    }

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

    const origin = `http://127.0.0.1:${address.port}`;

    return {
      authorizationUrl: `${origin}/authorize`,
      issuer: origin,
      jwksUrl: `${origin}/jwks`,
      tokenUrl: `${origin}/token`,
    };
  }

  async function issueTokens(serverUrl: string) {
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
      refresh_token: string;
    };
  }

  it("rotates refresh tokens through /token", async () => {
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

    const firstTokens = await issueTokens(server.url);

    const refreshed = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        grant_type: "refresh_token",
        refresh_token: firstTokens.refresh_token,
        scope: "openid",
      }),
    });

    expect(refreshed.status).toBe(200);
    const refreshedBody = await refreshed.json() as Record<string, unknown>;
    expect(refreshedBody).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      scope: "openid",
      token_type: "Bearer",
    });
    expect(refreshedBody["refresh_token"]).not.toBe(firstTokens.refresh_token);
  });

  it("expires downstream refresh tokens when the upstream provider never returned one", async () => {
    const realDateNow = Date.now;
    let currentTime = 1_700_000_000_000;
    Date.now = () => currentTime;

    try {
      const upstream = await startUpstreamOAuthServerWithoutRefreshToken();
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

      const firstTokens = await issueTokens(server.url);
      const refreshed = await fetch(new URL("/token", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          client_id: "client-a",
          grant_type: "refresh_token",
          refresh_token: firstTokens.refresh_token,
          scope: "openid",
        }),
      });

      expect(refreshed.status).toBe(200);
      const refreshedBody = await refreshed.json() as Record<string, unknown>;
      expect(refreshedBody).toMatchObject({
        access_token: expect.any(String),
        expires_in: 1800,
        refresh_token: expect.any(String),
        scope: "openid",
        token_type: "Bearer",
      });

      currentTime = 1_700_001_801_000;

      const expiredRefresh = await fetch(new URL("/token", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          client_id: "client-a",
          grant_type: "refresh_token",
          refresh_token: String(refreshedBody["refresh_token"]),
          scope: "openid",
        }),
      });

      expect(expiredRefresh.status).toBe(400);
      await expect(expiredRefresh.json()).resolves.toMatchObject({
        error: "invalid_grant",
        error_description: "Refresh token has expired.",
      });
    } finally {
      Date.now = realDateNow;
    }
  });
});
