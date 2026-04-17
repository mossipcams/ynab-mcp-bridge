import { createServer as createNodeHttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 token route", () => {
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

  async function issueAuthorizationCode(serverUrl: string) {
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

    return {
      code,
      verifier,
    };
  }

  it("redeems a local authorization code through /token", async () => {
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

    const issued = await issueAuthorizationCode(server.url);

    const response = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code!,
        code_verifier: issued.verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      scope: "openid profile",
      token_type: "Bearer",
    });
  });

  it("omits refresh_token through /token when the upstream provider did not return one", async () => {
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

    const issued = await issueAuthorizationCode(server.url);

    const response = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code!,
        code_verifier: issued.verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_token: expect.any(String),
      expires_in: 1800,
      scope: "openid profile",
      token_type: "Bearer",
    });
  });

  it("rejects a mismatched code_verifier through /token", async () => {
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

    const issued = await issueAuthorizationCode(server.url);

    const response = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code!,
        code_verifier: "wrong-verifier",
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "PKCE code_verifier is invalid.",
    });
  });

  it("rejects token endpoint client authentication for public clients", async () => {
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

    const issued = await issueAuthorizationCode(server.url);

    const response = await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("client-a:secret").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code!,
        code_verifier: issued.verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client",
      error_description: "Public clients must not use token endpoint authentication.",
    });
  });
});
