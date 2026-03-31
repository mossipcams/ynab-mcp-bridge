import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 live routes", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("serves /authorize from auth2 by default", async () => {
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

    const response = await fetch(new URL(
      `/authorize?client_id=client-a&redirect_uri=${encodeURIComponent("https://claude.ai/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge("client-a-verifier"))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(upstream.authorizationUrl);
    expect(response.headers.get("location")).toContain("code_challenge_method=S256");
    expect(response.headers.get("location")).toContain("redirect_uri=");
    expect(response.headers.get("location")).toContain("state=");
  });

  it("serves canonical authorization-server metadata from auth2", async () => {
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

    const oauthMetadata = await fetch(new URL("/.well-known/oauth-authorization-server", server.url));
    const openIdMetadata = await fetch(new URL("/.well-known/openid-configuration", server.url));

    expect(oauthMetadata.status).toBe(200);
    await expect(oauthMetadata.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });

    expect(openIdMetadata.status).toBe(200);
    await expect(openIdMetadata.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });
  });

  it("registers a public client and lets it use the canonical authorize endpoint", async () => {
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

    expect(registration.status).toBe(201);
    const registeredClient = await registration.json() as {
      client_id: string;
      client_id_issued_at: number;
      redirect_uris: string[];
      token_endpoint_auth_method: string;
    };
    expect(registeredClient.client_id).toBeTruthy();
    expect(registeredClient.client_id_issued_at).toBeGreaterThan(0);
    expect(registeredClient.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(registeredClient.token_endpoint_auth_method).toBe("none");

    const authorize = await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(registeredClient.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge("registered-client-verifier"))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=registered-client-state`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });

    expect(authorize.status).toBe(302);
    expect(authorize.headers.get("location")).toContain(upstream.authorizationUrl);
  });
});
