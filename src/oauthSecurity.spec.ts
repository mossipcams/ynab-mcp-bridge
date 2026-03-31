import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createServer as createNodeHttpServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { parseAuthConfig } from "./auth2/config/schema.js";
import { startHttpServer } from "./httpTransport.js";
import {
  createCloudflareOAuthAuth,
  registerOAuthClient,
  startAuthorization,
  startUpstreamOAuthServer,
} from "./oauthTestHelpers.js";

describe("oauth security regressions", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  function createAuth2Config(upstream: {
    authorizationUrl: string;
    issuer: string;
    jwksUrl: string;
    tokenUrl: string;
  }) {
    return parseAuthConfig({
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
  }

  async function startJwksServer() {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);

    jwk.kid = "oauth-security-test-key";

    const server = createNodeHttpServer((req, res) => {
      if (req.url !== "/jwks") {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
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
      jwksUrl: `http://127.0.0.1:${address.port}/jwks`,
      privateKey,
    };
  }

  async function createUpstreamAccessToken(privateKey: CryptoKey) {
    return await new SignJWT({
      client_id: "client-123",
      scope: "openid profile",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "oauth-security-test-key",
      })
      .setIssuedAt()
      .setIssuer("https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123")
      .setAudience("https://mcp.example.com/mcp")
      .setExpirationTime("5 minutes")
      .setSubject("user-123")
      .sign(privateKey);
  }

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });

  it("avoids rendering local consent HTML and redirects upstream directly for registered clients", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: createAuth2Config(upstream),
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
        client_name: "<script>alert('boom')</script>",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const registration = await registrationResponse.json() as { client_id: string };
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const body = await authorizeResponse.text();

    expect(authorizeResponse.status).toBe(302);
    expect(authorizeResponse.headers.get("location")).toContain(upstream.authorizationUrl);
    expect(body).not.toContain("<script>alert('boom')</script>");
  });

  it("rejects foreign origins before serving OAuth metadata", async () => {
    const { jwksUrl } = await startJwksServer();
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({ jwksUrl }),
      auth2Config: createAuth2Config({
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUrl,
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/.well-known/oauth-authorization-server", httpServer.url), {
      headers: {
        Origin: "https://evil.example",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden origin",
    });
  });

  it("rejects reused upstream callback state after the first successful exchange", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    const upstreamState = new URL(authorizeResponse.headers.get("location")!).searchParams.get("state");

    const firstResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const replayResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-456&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(firstResponse.status).toBe(302);
    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
  });

  it("rejects upstream bearer tokens passed directly to the MCP endpoint", async () => {
    const { jwksUrl, privateKey } = await startJwksServer();
    const token = await createUpstreamAccessToken(privateKey);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        jwksUrl,
      }),
      auth2Config: createAuth2Config({
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUrl,
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      }),
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
});
